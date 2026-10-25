"""Record one evaluated generation from JSON; callable by any future trainer."""
import argparse
import json
import os
import sqlite3
from pathlib import Path
from training_store import TrainingStore


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('record', help='JSON containing runId, generation, scores and evaluationSeeds')
    parser.add_argument('--timing-only', action='store_true', help='Update timing for an existing generation')
    parser.add_argument('--replay', help='Representative episode replay JSON')
    parser.add_argument('--directory', default=os.environ.get('BANANA_TRAINING_DIR'))
    args = parser.parse_args()
    try:
        record = json.loads(Path(args.record).read_text())
        if args.timing_only:
            print(json.dumps({'updated': TrainingStore(args.directory).record_timings([record])}))
            return
        replay = json.loads(Path(args.replay).read_text()) if args.replay else record.pop('replay', None)
        print(json.dumps(TrainingStore(args.directory).record_generation(record, replay), ensure_ascii=False))
    except (OSError, ValueError, TypeError, sqlite3.Error) as error:
        parser.exit(1, str(error) + '\n')


if __name__ == '__main__':
    main()
