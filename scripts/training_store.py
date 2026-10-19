"""Local generation metrics and bounded replay archive (stdlib only)."""
import fcntl
import hashlib
import json
import math
import re
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ['control.js', 'boss.js', 'surf.js', 'milk.js', 'entrance.js', 'giant.js', 'game.js']
DEFAULT_MAX_FILES = 100
DEFAULT_MAX_BYTES = 100_000_000
RUN_ID = re.compile(r'[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}\Z')


def source_digest():
    text = '\n'.join(name + '\n' + (ROOT / 'dist' / name).read_text() for name in SOURCES)
    return hashlib.sha256(text.encode()).hexdigest()


def number(value, name, low=0, high=60):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not low <= value <= high:
        raise ValueError(f'{name} must be between {low} and {high}')
    return value


def validate_tape(tape, digest):
    if not isinstance(tape, dict) or tape.get('sourceDigest') != digest:
        raise ValueError('Replay requires the current game source version')
    if tape.get('schema') != 1 or tape.get('ruleset') != 'banana-hop-sim-2' or tape.get('dt') != 1 / 60:
        raise ValueError('Unsupported replay format')
    config = tape.get('config', {})
    if config.get('mode') != 'milk' or type(config.get('seed')) is not int or not 0 <= config['seed'] <= 0xffffffff:
        raise ValueError('Training replay must use the milk stage and a valid seed')
    for key in ['width', 'height']:
        if type(config.get(key)) is not int or not 200 <= config[key] <= 4096:
            raise ValueError('Invalid replay viewport')
    if type(config.get('mobile')) is not bool or type(config.get('entrance')) is not bool:
        raise ValueError('Invalid replay configuration')
    steps = tape.get('steps')
    if type(steps) is not int or not 0 <= steps <= 2160000 or not isinstance(tape.get('actions'), list) or len(tape['actions']) > steps:
        raise ValueError('Invalid replay length')
    frames = 0
    for segment in tape['actions']:
        if not isinstance(segment, dict) or type(segment.get('frames')) is not int or segment['frames'] < 1:
            raise ValueError('Invalid replay segment')
        action = segment.get('action')
        if not isinstance(action, list) or len(action) != 6:
            raise ValueError('Invalid replay action')
        for value in action[:2]:
            number(value, 'movement', -1, 1)
        if any(type(value) is not int or value not in (0, 1) for value in action[2:]):
            raise ValueError('Invalid replay buttons')
        frames += segment['frames']
    if frames != steps or not isinstance(tape.get('finalDigest'), str):
        raise ValueError('Incomplete replay')


class TrainingStore:
    def __init__(self, root=None, max_files=DEFAULT_MAX_FILES, max_bytes=DEFAULT_MAX_BYTES):
        self.root = Path(root or ROOT / '.training')
        self.folder = self.root / 'replays'
        self.max_files, self.max_bytes = max_files, max_bytes
        if type(max_files) is not int or max_files < 1 or type(max_bytes) is not int or max_bytes < 1:
            raise ValueError('Invalid replay archive limits')

    @contextmanager
    def locked(self):
        self.folder.mkdir(parents=True, exist_ok=True)
        with (self.root / '.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            db = sqlite3.connect(self.root / 'metrics.sqlite3')
            db.row_factory = sqlite3.Row
            try:
                db.executescript('''
                  CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, name TEXT, trainer TEXT, created TEXT,
                    source_digest TEXT, evaluation TEXT, sample_count INTEGER, absolute REAL, relative REAL,
                    last_saved_best REAL, config TEXT);
                  CREATE TABLE IF NOT EXISTS generations(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT,
                    generation INTEGER, created TEXT, mean REAL, minimum REAL, maximum REAL, success_rate REAL,
                    samples INTEGER, reason TEXT, replay TEXT, bytes INTEGER, replay_score REAL,
                    UNIQUE(run_id,generation));
                ''')
                # A crash while saving can leave only our own unreferenced file.
                owned = {row[0] for row in db.execute('SELECT replay FROM generations WHERE replay IS NOT NULL')}
                for name in owned:
                    if not (self.folder / name).is_file():
                        db.execute('UPDATE generations SET replay=NULL,bytes=0 WHERE replay=?', (name,))
                for path in self.folder.iterdir():
                    if re.fullmatch(r'[a-f0-9]{24}\.json(?:\.tmp)?', path.name) and path.name not in owned:
                        path.unlink()
                yield db
                db.commit()
            finally:
                db.close()
                fcntl.flock(lock, fcntl.LOCK_UN)

    def usage(self):
        files = [p for p in self.folder.iterdir() if p.is_file()]
        return {'files': len(files), 'bytes': sum(p.stat().st_size for p in files),
                'maxFiles': self.max_files, 'maxBytes': self.max_bytes}

    def record_generation(self, record, replay=None):
        if not isinstance(record, dict):
            raise ValueError('Generation record must be an object')
        run_id, generation, scores = record.get('runId'), record.get('generation'), record.get('scores')
        if not isinstance(run_id, str) or not RUN_ID.fullmatch(run_id) or type(generation) is not int or generation < 1:
            raise ValueError('Invalid runId or generation')
        if not isinstance(scores, list) or not 1 <= len(scores) <= 10000:
            raise ValueError('scores must contain 1 to 10000 survival times')
        scores = [number(s, 'survival seconds') for s in scores]
        config = record.get('config', {})
        if not isinstance(config, dict) or len(json.dumps(config)) > 16000:
            raise ValueError('Invalid run configuration')
        seeds = record.get('evaluationSeeds')
        if not isinstance(seeds, list) or len(seeds) != len(scores) or any(type(s) is not int or not 0 <= s <= 0xffffffff for s in seeds) or len(set(seeds)) != len(seeds):
            raise ValueError('evaluationSeeds must match scores and contain unique uint32 seeds')
        evaluation = json.dumps(seeds, separators=(',', ':'))
        name, trainer = record.get('name', run_id), record.get('trainer', 'unspecified')
        if not isinstance(name, str) or not 1 <= len(name) <= 120 or not isinstance(trainer, str) or not 1 <= len(trainer) <= 80:
            raise ValueError('Invalid run name or trainer label')
        config_text = json.dumps(config, sort_keys=True, allow_nan=False)
        mean = sum(scores) / len(scores)
        now = datetime.now(timezone.utc).isoformat()
        digest = source_digest()
        with self.locked() as db:
            run = db.execute('SELECT * FROM runs WHERE id=?', (run_id,)).fetchone()
            last = db.execute('SELECT MAX(generation) FROM generations WHERE run_id=?', (run_id,)).fetchone()[0]
            if run:
                if generation != last + 1:
                    raise ValueError(f'Expected generation {last + 1}')
                if run['source_digest'] != digest or run['evaluation'] != evaluation or run['config'] != config_text:
                    raise ValueError('Game version, evaluation seeds or config changed; start a new runId')
                absolute, relative, best = run['absolute'], run['relative'], run['last_saved_best']
            else:
                if generation != 1:
                    raise ValueError('A new run must start at generation 1')
                absolute = number(record.get('breakthroughSeconds', 1), 'breakthroughSeconds')
                relative = number(record.get('breakthroughRatio', .05), 'breakthroughRatio', 0, 1)
                best = None
            significant = best is None or mean > best + 1e-9 and mean + 1e-9 >= best + max(absolute, abs(best) * relative)
            reason = 'baseline' if best is None else 'breakthrough' if significant else 'score-only'
            filename, content, replay_score = None, None, None
            if significant:
                if replay is None:
                    raise ValueError('Replay is required for generation 1 and significant breakthroughs')
                validate_tape(replay, digest)
                if replay['config']['seed'] not in seeds:
                    raise ValueError('Replay seed is not in this evaluation set')
                replay_score = scores[seeds.index(replay['config']['seed'])]
                actual = replay.get('result', {}).get('gameSeconds')
                if not isinstance(actual, (int, float)) or not math.isfinite(actual) or actual > 60 + 1e-6 or abs(actual - replay_score) > .05:
                    raise ValueError('Replay must stop in survival and match its evaluation score')
                content = json.dumps(replay, separators=(',', ':'), allow_nan=False).encode()
                filename = hashlib.sha256(f'{run_id}:{generation}'.encode()).hexdigest()[:24] + '.json'
                usage = self.usage()
                removable = list(db.execute("SELECT id,replay,bytes FROM generations WHERE replay IS NOT NULL AND reason!='baseline' ORDER BY id"))
                victims = []
                count, size = usage['files'] + 1, usage['bytes'] + len(content)
                for old in removable:
                    if count <= self.max_files and size <= self.max_bytes:
                        break
                    victims.append(old)
                    count -= 1
                    size -= old['bytes']
                if count > self.max_files or size > self.max_bytes:
                    raise ValueError('Replay budget cannot fit this file while preserving first-generation baselines')
                # Make room before writing, so even the temporary file stays in budget.
                for old in victims:
                    db.execute('UPDATE generations SET replay=NULL,bytes=0 WHERE id=?', (old['id'],))
                db.commit()
                for old in victims:
                    (self.folder / old['replay']).unlink(missing_ok=True)
                temporary = self.folder / (filename + '.tmp')
                try:
                    temporary.write_bytes(content)
                    temporary.replace(self.folder / filename)
                finally:
                    temporary.unlink(missing_ok=True)
            if not run:
                db.execute('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?,?,?)', (run_id, name, trainer, now, digest, evaluation, len(scores), absolute, relative, mean, config_text))
            elif significant:
                db.execute('UPDATE runs SET last_saved_best=? WHERE id=?', (mean, run_id))
            db.execute('INSERT INTO generations(run_id,generation,created,mean,minimum,maximum,success_rate,samples,reason,replay,bytes,replay_score) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                       (run_id, generation, now, mean, min(scores), max(scores), sum(s >= 60 - 1e-6 for s in scores) / len(scores), len(scores), reason, filename, len(content) if content else 0, replay_score))
            return {'runId': run_id, 'generation': generation, 'reason': reason, 'replay': filename, 'usage': self.usage()}

    def snapshot(self, run_id=None, after=0, limit=500):
        with self.locked() as db:
            runs = [dict(row) for row in db.execute('SELECT r.*,COUNT(g.id) generations,MAX(g.mean) best FROM runs r JOIN generations g ON g.run_id=r.id GROUP BY r.id ORDER BY r.created DESC')]
            chosen = run_id or (runs[0]['id'] if runs else None)
            rows = [dict(row) for row in db.execute('SELECT * FROM generations WHERE run_id=? AND generation>? ORDER BY generation LIMIT ?', (chosen, after, min(500, max(1, limit))))]
            retained = [row[0] for row in db.execute('SELECT replay FROM generations WHERE replay IS NOT NULL')]
            return {'runs': runs, 'runId': chosen, 'generations': rows, 'retained': retained, 'usage': self.usage(), 'sourceDigest': source_digest()}

    def replay(self, name):
        if not re.fullmatch(r'[a-f0-9]{24}\.json', name):
            raise FileNotFoundError('Invalid replay name')
        with self.locked() as db:
            if not db.execute('SELECT 1 FROM generations WHERE replay=?', (name,)).fetchone():
                raise FileNotFoundError('Replay was rotated out or does not exist')
            return (self.folder / name).read_bytes()
