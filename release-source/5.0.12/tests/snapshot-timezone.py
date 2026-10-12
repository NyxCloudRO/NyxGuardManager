"""Verify durable SQL fingerprints across process time zones on a disposable DB."""
import json, os, pathlib, subprocess
assert os.environ.get('NYXGUARD_DISPOSABLE_ACCEPTANCE') == '1'
manager = os.environ['MANAGER_CONTAINER']
info = json.loads(subprocess.check_output(['docker', 'inspect', manager]))[0]
assert info['Config']['Labels'].get('ro.nyxcloud.acceptance') == '5.0.12'
root = pathlib.Path(__file__).resolve().parents[3]
source = (root/'update.sh').read_text()
snapshot = source.split("SNAPSHOT=r'''", 1)[1].split("'''", 1)[0]
def capture(code, zone):
    p = subprocess.run(['docker','exec','-i',manager,'env','TZ='+zone,'node','-e',code],
                       input='null',text=True,capture_output=True)
    assert p.returncode == 0, 'Disposable snapshot failed'
    return json.loads(p.stdout)
# The old implementation must reproduce the defect, so this cannot pass with
# empty or timezone-insensitive fixture data.
old = snapshot.replace(',timezone:"Z"', '')
assert capture(old, 'UTC') != capture(old, 'Europe/Bucharest'), 'Fixture did not reproduce timezone mismatch'
assert capture(snapshot, 'UTC') == capture(snapshot, 'Europe/Bucharest'), 'Timezone-dependent preservation fingerprints'
print('PASS: identical durable SQL fingerprints across process time zones')
