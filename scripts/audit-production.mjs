import { spawnSync } from 'node:child_process';
import process from 'node:process';

const APPROVED_ADVISORIES = new Map([
  ['react-router', new Set(['GHSA-qwww-vcr4-c8h2'])],
]);

const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

if (audit.error || (audit.status !== 0 && audit.status !== 1)) {
  process.stderr.write('npm audit não foi concluído corretamente.\n');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write('Não foi possível interpretar a resposta do npm audit.\n');
  process.exit(1);
}

if (!report || typeof report !== 'object' || !report.vulnerabilities) {
  process.stderr.write('Resposta inesperada do npm audit.\n');
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities;
const allowedCache = new Map();

function isAllowed(packageName, visiting = new Set()) {
  const cached = allowedCache.get(packageName);
  if (cached !== undefined) return cached;
  if (visiting.has(packageName)) return false;

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability || !Array.isArray(vulnerability.via) || vulnerability.via.length === 0) {
    allowedCache.set(packageName, false);
    return false;
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(packageName);
  const allowed = vulnerability.via.every((source) => {
    if (typeof source === 'string') return isAllowed(source, nextVisiting);
    if (!source || typeof source !== 'object' || typeof source.url !== 'string') return false;
    const advisoryId = source.url.match(
      /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/,
    )?.[1];
    return advisoryId !== undefined
      && APPROVED_ADVISORIES.get(packageName)?.has(advisoryId) === true;
  });
  allowedCache.set(packageName, allowed);
  return allowed;
}

const rejected = Object.keys(vulnerabilities).filter((packageName) => !isAllowed(packageName));
if (rejected.length > 0) {
  process.stderr.write(`npm audit encontrou vulnerabilidades não aprovadas: ${rejected.join(', ')}\n`);
  process.exit(1);
}

if ((audit.status === 0) !== (Object.keys(vulnerabilities).length === 0)) {
  process.stderr.write('Status inconsistente na resposta do npm audit.\n');
  process.exit(1);
}

if (audit.status === 0) {
  process.stdout.write('npm audit não encontrou vulnerabilidades de produção.\n');
} else {
  process.stdout.write(
    'npm audit: exceção temporária restrita a GHSA-qwww-vcr4-c8h2 (React Router RSC não utilizado).\n',
  );
}
