// mailer.js — minimal SMTP client using only Node built-ins (net + tls).
// No npm dependency. Configured entirely via environment variables:
//   TB_SMTP_HOST   smtp server host           (required to send)
//   TB_SMTP_PORT   port (default 587)
//   TB_SMTP_SECURE 'ssl' | 'starttls' | 'none' (default: ssl if port 465 else starttls)
//   TB_SMTP_USER   auth username (optional)
//   TB_SMTP_PASS   auth password (optional)
//   TB_SMTP_FROM   From: address, e.g. "Talent Battle <no-reply@talentbattle.in>" (required)
//   TB_PUBLIC_URL  base URL used to build links, e.g. https://code.talentbattle.in
// If not configured, configured() returns false and callers skip sending.
const net = require('net');
const tls = require('tls');
const os = require('os');

const env = (k, d) => { const v = process.env[k]; return v == null || v === '' ? d : v; };
const configured = () => !!(env('TB_SMTP_HOST') && env('TB_SMTP_FROM'));
const publicBase = () => String(env('TB_PUBLIC_URL', '') || '').replace(/\/+$/, '');
const addr = (s) => { const m = String(s).match(/<([^>]+)>/); return (m ? m[1] : s).trim(); };
const once = (em, ev) => new Promise((res, rej) => { em.once(ev, res); em.once('error', rej); });

// Locate the end of one complete SMTP reply (final line is "NNN " with a space).
function findFinal(buf) { const m = /^\d{3} .*\r?\n/m.exec(buf); return m ? m.index + m[0].length : -1; }

function channel(sock) {
  let buf = '', waiter = null;
  const pump = () => {
    if (!waiter) return;
    const i = findFinal(buf); if (i < 0) return;
    const chunk = buf.slice(0, i); buf = buf.slice(i);
    const w = waiter; waiter = null; w.resolve({ code: parseInt(chunk.slice(0, 3), 10), text: chunk });
  };
  const onData = (d) => { buf += d; pump(); };
  const onErr = (e) => { if (waiter) { const w = waiter; waiter = null; w.reject(e); } };
  sock.setEncoding('utf8'); sock.on('data', onData); sock.on('error', onErr);
  return {
    read() { return new Promise((res, rej) => { waiter = { resolve: res, reject: rej }; pump(); }); },
    write(s) { sock.write(s); },
    detach() { sock.removeListener('data', onData); sock.removeListener('error', onErr); },
    sock,
  };
}

function buildMessage({ from, to, subject, text, html }) {
  const headers = [`From: ${from}`, `To: ${to}`, `Subject: ${subject}`,
    `Date: ${new Date().toUTCString()}`, `MIME-Version: 1.0`];
  let body;
  if (html) {
    const b = '=_tb_' + Math.random().toString(36).slice(2);
    headers.push(`Content-Type: multipart/alternative; boundary="${b}"`);
    body = [`--${b}`, 'Content-Type: text/plain; charset=utf-8', '', text || html.replace(/<[^>]+>/g, ''), '',
      `--${b}`, 'Content-Type: text/html; charset=utf-8', '', html, '', `--${b}--`, ''].join('\r\n');
  } else {
    headers.push('Content-Type: text/plain; charset=utf-8');
    body = text || '';
  }
  const raw = headers.join('\r\n') + '\r\n\r\n' + body;
  // Normalise line endings and dot-stuff any line that begins with a period.
  return raw.replace(/\r?\n/g, '\r\n').replace(/\r\n\./g, '\r\n..');
}

async function converse({ to, subject, text, html }) {
  const host = env('TB_SMTP_HOST'), port = parseInt(env('TB_SMTP_PORT', '587'), 10);
  const user = env('TB_SMTP_USER'), pass = env('TB_SMTP_PASS'), from = env('TB_SMTP_FROM');
  const secure = env('TB_SMTP_SECURE', port === 465 ? 'ssl' : 'starttls');
  const myHost = os.hostname() || 'localhost';
  const expect = async (ch, code) => { const r = await ch.read(); if (r.code !== code) throw new Error(`SMTP ${r.code}: ${r.text.trim()} (expected ${code})`); return r; };
  const cmd = (ch, line, code) => { ch.write(line + '\r\n'); return expect(ch, code); };

  let sock = secure === 'ssl' ? tls.connect({ host, port, servername: host }) : net.connect({ host, port });
  await once(sock, secure === 'ssl' ? 'secureConnect' : 'connect');
  let ch = channel(sock);
  await expect(ch, 220);
  await cmd(ch, `EHLO ${myHost}`, 250);
  if (secure === 'starttls') {
    await cmd(ch, 'STARTTLS', 220);
    ch.detach();
    const tsock = tls.connect({ socket: sock, servername: host });
    await once(tsock, 'secureConnect');
    ch = channel(tsock);
    await cmd(ch, `EHLO ${myHost}`, 250);
  }
  if (user && pass) {
    await cmd(ch, 'AUTH LOGIN', 334);
    await cmd(ch, Buffer.from(user).toString('base64'), 334);
    await cmd(ch, Buffer.from(pass).toString('base64'), 235);
  }
  await cmd(ch, `MAIL FROM:<${addr(from)}>`, 250);
  await cmd(ch, `RCPT TO:<${addr(to)}>`, 250);
  await cmd(ch, 'DATA', 354);
  ch.write(buildMessage({ from, to, subject, text, html }) + '\r\n.\r\n');
  await expect(ch, 250);
  try { ch.write('QUIT\r\n'); } catch (e) {}
  try { ch.sock.end(); } catch (e) {}
  return true;
}

// Send an email. Rejects if SMTP is not configured or the server refuses.
// A 15s watchdog prevents a hung connection from stalling the request.
function sendMail(opts) {
  if (!configured()) return Promise.reject(new Error('SMTP not configured'));
  return Promise.race([
    converse(opts),
    new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP timeout')), 15000)),
  ]);
}

module.exports = { sendMail, configured, publicBase };
