// languages.js
// -----------------------------------------------------------------------------
// One place that defines HOW each programming language is compiled and run.
// To add a new language later (JavaScript, Go, C#, ...), you add one entry here.
// Nothing else in the judge needs to change.
// -----------------------------------------------------------------------------

const { execSync } = require('child_process');

// Pick whichever Python command exists: 'python3' (Mac/Linux) or 'python' (Windows).
function resolvePython() {
  for (const cmd of ['python3', 'python']) {
    try { execSync(cmd + ' --version', { stdio: 'ignore' }); return cmd; } catch (e) {}
  }
  return 'python3';
}
const PYTHON = resolvePython();

const LANGUAGES = {
  python: {
    label: 'Python 3',
    sourceFile: 'main.py',
    compile: null,               // interpreted: no separate compile step
    run: [PYTHON, 'main.py'],
  },

  c: {
    label: 'C',
    sourceFile: 'main.c',
    compile: ['gcc', 'main.c', '-O2', '-o', 'main', '-lm'], // -lm links math lib
    run: ['./main'],
  },

  cpp: {
    label: 'C++17',
    sourceFile: 'main.cpp',
    compile: ['g++', 'main.cpp', '-O2', '-std=c++17', '-o', 'main'],
    run: ['./main'],
  },

  java: {
    label: 'Java',
    sourceFile: 'Main.java',     // public class name must match the file name
    compile: ['javac', 'Main.java'],
    run: ['java', 'Main'],
  },
};

module.exports = { LANGUAGES };
