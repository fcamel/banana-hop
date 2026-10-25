"""Import real per-generation CLI timing, including a currently running old trainer."""
import argparse
import json
import os
import time
from pathlib import Path
from training_store import TrainingStore


def read_records(stream):
    records, complete = [], False
    while True:
        offset = stream.tell()
        line = stream.readline()
        if not line:
            break
        if not line.endswith('\n'):
            stream.seek(offset)
            break
        if line.startswith('Checkpoint: '):
            complete = True
        try:
            item = json.loads(line)
        except ValueError:
            continue
        if isinstance(item, dict) and all(k in item for k in ['runId', 'generation', 'timingSeconds']):
            records.append({k: item[k] for k in ['runId', 'generation', 'timingSeconds']})
    return records, complete


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('logs', nargs='+', type=Path)
    parser.add_argument('--directory', default=os.environ.get('BANANA_TRAINING_DIR'))
    parser.add_argument('--follow', action='store_true', help='Follow one live log until its Checkpoint line')
    args = parser.parse_args()
    if args.follow and len(args.logs) != 1:
        parser.error('--follow requires one log')
    store = TrainingStore(args.directory)
    for path in args.logs:
        with path.open(encoding='utf-8', errors='replace') as stream:
            while True:
                records, complete = read_records(stream)
                if records:
                    count = store.record_timings(records, only_missing=True)
                    print(json.dumps({'log': str(path), 'filled': count}), flush=True)
                if not args.follow or complete:
                    break
                time.sleep(2)


if __name__ == '__main__':
    main()
