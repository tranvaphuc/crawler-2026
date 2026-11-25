"""Run a reviewed Python maintenance file on the forum VPS; never print credentials."""
from pathlib import Path
import sys, shlex
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0, str(Path('.cache/forum-deploy-python').resolve()))
import paramiko
from dotenv import dotenv_values

env = dotenv_values('../cms-2026/.env')
assert env['SSH_HOST'] == '148.113.144.41'
client = paramiko.SSHClient()
client.load_system_host_keys()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    client.connect(env['SSH_HOST'], username=env['SSH_USER'], password=env['SSH_PASS'], timeout=15, allow_agent=False, look_for_keys=False)
    code = Path(sys.argv[1]).read_text(encoding='utf-8-sig')
    stdin, stdout, stderr = client.exec_command('sudo -S -p "" python3 -c ' + shlex.quote(code), timeout=300)
    stdin.write(env['SSH_PASS'] + '\n')
    stdin.flush()
    stdin.channel.shutdown_write()
    output = stdout.read().decode()
    error = stderr.read().decode()
    status = stdout.channel.recv_exit_status()
    print(output)
    if status:
        raise RuntimeError('Forum maintenance failed: ' + error[:1500])
finally:
    client.close()

