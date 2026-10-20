"""Regression checks use isolated temporary archives, never real training data."""
import copy
import importlib.util
import json
import math
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from training_store import TrainingStore, source_digest, validate_tape
from serve import LocalHandler


def tape(score=1, seed=7, padding=0):
    # A structurally valid fixture, not a trained policy or physical evaluation.
    return {'schema': 1, 'ruleset': 'banana-hop-sim-2', 'dt': 1 / 60, 'sourceDigest': source_digest(),
            'config': {'mode': 'milk', 'seed': seed, 'width': 1000, 'height': 650, 'mobile': False, 'entrance': False},
            'steps': 1, 'actions': [{'frames': 1, 'action': [0, 0, 0, 0, 0, 0]}], 'finalDigest': 'fixture',
            'result': {'gameSeconds': score}, 'padding': 'x' * padding}


def record(generation, score, run='test', **extra):
    return {'runId': run, 'generation': generation, 'scores': [score], 'evaluationSeeds': [7],
            'trainer': 'fixture, not NN', **extra}


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = TrainingStore(self.temp.name, max_files=3, max_bytes=100000)

    def tearDown(self):
        self.temp.cleanup()

    def save(self, generation, score, **extra):
        return self.store.record_generation(record(generation, score, **extra), tape(score))

    def test_empty_archive_and_defaults(self):
        self.assertEqual(self.store.snapshot()['runs'], [])
        self.assertEqual(TrainingStore().max_files, 100)
        self.assertEqual(TrainingStore().max_bytes, 100000000)

    def test_first_ten_replays_save_every_new_high_including_small_gains(self):
        self.store.max_files = 100
        self.assertEqual(self.save(1, 10)['reason'], 'baseline')
        for generation in range(2, 11):
            self.assertEqual(self.save(generation, 10 + (generation - 1) * .01)['reason'], 'breakthrough')
        self.assertEqual(self.store.usage()['files'], 10)
        self.assertEqual(self.store.record_generation(record(11, 10.1))['reason'], 'score-only')
        self.assertEqual(self.save(12, 11.09)['reason'], 'breakthrough')

    def test_relative_threshold_after_ten_uses_last_retained_best(self):
        self.store.max_files = 100
        for generation in range(1, 11):
            self.save(generation, 40 + (generation - 1) * .1)
        self.assertEqual(self.store.record_generation(record(11, 41))['reason'], 'score-only')
        self.assertEqual(self.save(12, 43)['reason'], 'breakthrough')
        self.assertEqual(self.store.record_generation(record(13, 44))['reason'], 'score-only')

    def test_new_high_is_per_run_and_compares_all_historical_scores_after_rotation(self):
        self.store.max_files = 12
        for generation in range(1, 11):
            self.save(generation, 40 + (generation - 1) * .1)
        self.store.record_generation(record(11, 41))
        # Global rotation leaves this run below ten retained replays, but its
        # unsaved historical high must still prevent recording a lower score.
        for generation in range(1, 4):
            self.save(generation, generation, run='other')
        self.assertEqual(self.store.record_generation(record(12, 40.95))['reason'], 'score-only')
        self.assertEqual(self.store.record_generation(record(13, 41))['reason'], 'score-only')
        self.assertEqual(self.save(14, 41.01)['reason'], 'breakthrough')

    def test_ties_and_regressions_never_create_early_replays(self):
        self.save(1, 10)
        self.assertEqual(self.store.record_generation(record(2, 10))['reason'], 'score-only')
        self.assertEqual(self.store.record_generation(record(3, 9))['reason'], 'score-only')
        with self.assertRaises(ValueError):
            self.store.record_generation(record(4, 10.01))
        self.assertEqual(len(self.store.snapshot()['generations']), 3)
        self.assertEqual(self.save(4, 10.01)['reason'], 'breakthrough')

    def test_every_new_record_option_and_no_ties(self):
        self.save(1, 10, breakthroughSeconds=0, breakthroughRatio=0)
        self.assertEqual(self.save(2, 10.01)['reason'], 'breakthrough')
        self.assertEqual(self.save(3, 10.01)['reason'], 'score-only')

    def test_baseline_plus_latest_two_and_metrics_survive_rotation(self):
        names = [self.save(i, i * 2)['replay'] for i in range(1, 7)]
        rows = self.store.snapshot()['generations']
        self.assertEqual(len(rows), 6)
        self.assertEqual(self.store.usage()['files'], 3)
        self.assertEqual([r['generation'] for r in rows if r['replay']], [1, 5, 6])
        self.assertTrue((self.store.folder / names[0]).exists())
        with self.assertRaises(FileNotFoundError):
            self.store.replay(names[1])

    def test_byte_cap_independent_of_file_cap(self):
        self.store.max_bytes = 1800
        self.save(1, 1)
        for i in range(2, 10):
            self.save(i, i)
            self.assertLessEqual(self.store.usage()['bytes'], 1800)
            self.assertLessEqual(self.store.usage()['files'], 3)
        self.assertTrue(self.store.snapshot()['generations'][0]['replay'])

    def test_oversized_replay_does_not_remove_baseline_or_write_generation(self):
        baseline = self.save(1, 1)['replay']
        with self.assertRaises(ValueError):
            self.store.record_generation(record(2, 3), tape(3, padding=100001))
        self.assertTrue((self.store.folder / baseline).exists())
        self.assertEqual(len(self.store.snapshot()['generations']), 1)

    def test_pinned_baselines_cannot_be_evicted_by_another_run(self):
        for run in ['a', 'b', 'c']:
            self.save(1, 1, run=run)
        with self.assertRaises(ValueError):
            self.save(1, 1, run='d')
        self.assertEqual(self.store.usage()['files'], 3)

    def test_seed_set_config_and_source_cannot_silently_change(self):
        self.save(1, 1)
        for changes in [{'evaluationSeeds': [8]}, {'config': {'mobile': True}}]:
            with self.assertRaises(ValueError):
                self.store.record_generation(record(2, 3, **changes), tape(3))
        with patch('training_store.source_digest', return_value='old'):
            with self.assertRaises(ValueError):
                self.save(2, 3)

    def test_invalid_metrics_and_sequences(self):
        for score in [math.nan, math.inf, -1, 61, True, '1']:
            with self.assertRaises(ValueError):
                self.save(1, score)
        for generation in [0, 2, True]:
            with self.assertRaises(ValueError):
                self.save(generation, 1)
        self.save(1, 1)
        with self.assertRaises(ValueError):
            self.save(1, 2)

    def test_replay_required_only_when_retained_and_score_must_match(self):
        with self.assertRaises(ValueError):
            self.store.record_generation(record(1, 1))
        self.save(1, 1)
        self.store.record_generation(record(2, 1))
        with self.assertRaises(ValueError):
            self.store.record_generation(record(3, 3))
        with self.assertRaises(ValueError):
            self.store.record_generation(record(3, 3), tape(2))

    def test_replay_validation_and_path_traversal(self):
        base = tape()
        for key, value in [('sourceDigest', 'old'), ('steps', 2), ('actions', [{'frames': 1, 'action': [2, 0, 0, 0, 0, 0]}])]:
            bad = copy.deepcopy(base)
            bad[key] = value
            with self.assertRaises(ValueError):
                validate_tape(bad, source_digest())
        for name in ['../metrics.sqlite3', 'not-managed.json', '/tmp/anything']:
            with self.assertRaises(FileNotFoundError):
                self.store.replay(name)

    def test_restart_and_pagination(self):
        self.save(1, 1)
        self.save(2, 1)
        store = TrainingStore(self.temp.name)
        self.assertEqual([r['generation'] for r in store.snapshot(after=1)['generations']], [2])
        self.assertEqual(len(store.snapshot(limit=1)['generations']), 1)

    def test_concurrent_duplicate_generation_is_rejected(self):
        def write():
            try:
                self.save(1, 1)
                return True
            except ValueError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            self.assertEqual(sum(pool.map(lambda _: write(), range(2))), 1)
        self.assertEqual(self.store.usage()['files'], 1)

    def test_orphan_temporary_files_recover_without_touching_unknown_files(self):
        self.save(1, 1)
        (self.store.folder / ('a' * 24 + '.json.tmp')).write_text('interrupted')
        foreign = self.store.folder / 'personal.txt'
        foreign.write_text('keep')
        self.store.snapshot()
        self.assertTrue(foreign.exists())
        self.assertFalse((self.store.folder / ('a' * 24 + '.json.tmp')).exists())

    def test_disabled_local_tool_returns_404_without_creating_store(self):
        handler = object.__new__(LocalHandler)
        handler.path = '/training/'
        handler.send_error = lambda code, *args: self.assertEqual(code, 404)
        with patch.dict('os.environ', {'BANANA_AI_REPLAY': '0'}):
            self.assertIsNone(handler.send_head())
        handler.path = '/training/api/generations'
        with patch.dict('os.environ', {'BANANA_AI_REPLAY': '0'}):
            handler.do_POST()


if __name__ == '__main__':
    unittest.main()
