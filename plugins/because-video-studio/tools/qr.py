# .venv/bin/python tools/qr.py "<url>" <out.js>
# Writes window.QR = [[0/1, ...], ...] (no quiet zone; library/pieces/qr-endcard.js adds it) for any URL, error correction M.
import sys, json, qrcode
url, out = sys.argv[1], sys.argv[2]
q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0); q.add_data(url); q.make(fit=True)
m = [[1 if v else 0 for v in row] for row in q.get_matrix()]
open(out, 'w').write('window.QR=' + json.dumps(m, separators=(',', ':')) + ';\n')
print(f'{len(m)}x{len(m)} QR for {url} -> {out}')
