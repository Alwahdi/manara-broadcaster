import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Pass an admin password with at least 12 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);
process.stdout.write(`scrypt:${salt.toString("base64")}:${hash.toString("base64")}\n`);
