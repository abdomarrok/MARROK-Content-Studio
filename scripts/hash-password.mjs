#!/usr/bin/env node
import crypto from 'node:crypto';
import readline from 'node:readline';

function hashPasswordScrypt(password, customSaltHex) {
  const salt = customSaltHex
    ? Buffer.from(customSaltHex, 'hex')
    : crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

function promptHidden(query) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdout.write(query);
      let input = '';
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char) => {
        const s = char.toString('utf8');
        switch (s) {
          case '\n':
          case '\r':
          case '\u0004':
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(input);
            break;
          case '\u0003': // Ctrl+C
            process.stdin.setRawMode(false);
            process.stdout.write('\n');
            process.exit(1);
            break;
          case '\u007f': // Backspace
          case '\b':
            if (input.length > 0) {
              input = input.slice(0, -1);
            }
            break;
          default:
            input += s;
            break;
        }
      };

      process.stdin.on('data', onData);
    } else {
      // Non-interactive / piped stdin
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      rl.question(query, (ans) => {
        rl.close();
        resolve(ans.trim());
      });
    }
  });
}

async function main() {
  process.stdout.write('\n🔒 MARROK Content Studio — Secure Admin Password Hasher\n');
  process.stdout.write('   Password input is masked and will NOT be saved to shell history.\n\n');

  const password = await promptHidden('Enter admin password: ');
  if (!password || password.length < 8) {
    process.stderr.write('❌ Error: Password must be at least 8 characters.\n');
    process.exit(1);
  }

  const confirm = await promptHidden('Confirm admin password: ');
  if (password !== confirm) {
    process.stderr.write('❌ Error: Passwords do not match.\n');
    process.exit(1);
  }

  const hash = hashPasswordScrypt(password);
  process.stdout.write('\n✅ Generated scrypt password hash:\n\n');
  process.stdout.write(`ADMIN_PASSWORD_HASH=${hash}\n\n`);
  process.stdout.write('Copy the value above into your Netlify Environment Variables.\n\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
