// languages.js — how each language is compiled/run + a `probe` to detect if the
// runtime is installed on the machine. Add a language = one entry here.
const { execSync } = require('child_process');
function resolvePython() {
  for (const cmd of ['python3', 'python']) { try { execSync(cmd + ' --version', { stdio: 'ignore' }); return cmd; } catch (e) {} }
  return 'python3';
}
const PYTHON = resolvePython();

const LANGUAGES = {
  python:     { label: 'Python 3',           sourceFile: 'main.py',   compile: null, run: [PYTHON, 'main.py'], probe: PYTHON + ' --version' },
  c:          { label: 'C',                  sourceFile: 'main.c',    compile: ['gcc', 'main.c', '-O2', '-o', 'main', '-lm'], run: ['./main'], probe: 'gcc --version' },
  cpp:        { label: 'C++17',              sourceFile: 'main.cpp',  compile: ['g++', 'main.cpp', '-O2', '-std=c++17', '-o', 'main'], run: ['./main'], probe: 'g++ --version' },
  java:       { label: 'Java',               sourceFile: 'Main.java', compile: ['javac', 'Main.java'], run: ['java', 'Main'], probe: 'javac -version' },
  javascript: { label: 'JavaScript (Node)',  sourceFile: 'main.js',   compile: null, run: ['node', 'main.js'], probe: 'node --version' },
  bash:       { label: 'Bash',               sourceFile: 'main.sh',   compile: null, run: ['bash', 'main.sh'], probe: 'bash --version' },
  go:         { label: 'Go',                 sourceFile: 'main.go',   compile: ['go', 'build', '-o', 'main', 'main.go'], run: ['./main'], probe: 'go version' },
  ruby:       { label: 'Ruby',               sourceFile: 'main.rb',   compile: null, run: ['ruby', 'main.rb'], probe: 'ruby --version' },
  php:        { label: 'PHP',                sourceFile: 'main.php',  compile: null, run: ['php', 'main.php'], probe: 'php --version' },
  rust:       { label: 'Rust',               sourceFile: 'main.rs',   compile: ['rustc', '-O', 'main.rs', '-o', 'main'], run: ['./main'], probe: 'rustc --version' },
};
module.exports = { LANGUAGES };
