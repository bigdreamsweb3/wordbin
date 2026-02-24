Here's the **CONTRIBUTING.md** file ready for you to download and use in your project.

You can copy the content below and save it as `CONTRIBUTING.md` in the root of your repository.

```markdown
# Contributing to WordBin

Thank you for your interest in contributing to WordBin!  
We welcome all kinds of help — bug reports, documentation improvements, new features, dictionary variants, tests, or even small fixes.

This guide explains how to contribute effectively and what would be most valuable to the project right now.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Bugs](#reporting-bugs)
  - [Suggesting Features or Improvements](#suggesting-features-or-improvements)
  - [Submitting Pull Requests](#submitting-pull-requests)
  - [Good First Issues](#good-first-issues)
- [Development Setup](#development-setup)
- [Current Priorities (2026)](#current-priorities-2026)
- [Code Style & Conventions](#code-style--conventions)
- [License](#license)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).  
Be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

If you find a bug:

1. Check if it's already reported in [existing issues](https://github.com/bigdreamsweb3/wordbin/issues).
2. If not, open a new issue and include:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Node.js / browser version
   - Dictionary version used (v1/v2/custom)
   - Minimal code snippet or test case

Use the **Bug report** template when available.

### Suggesting Features or Improvements

Have an idea for a new feature, better performance, UX improvement, or new dictionary type?

Open an issue with:
- Problem or opportunity you're addressing
- Proposed solution (as detailed as you want)
- Any alternatives you've considered
- Rough estimate of impact/benefit

Use the **Feature request** template if it exists.

### Submitting Pull Requests

Want to submit code? Awesome!

1. **Fork** the repository and **clone** your fork
2. Create a new branch:  
   `git checkout -b fix/lowercase-normalization`  
   or `feat/add-top-20k-dictionary`
3. Make your changes
4. Add or update tests if applicable
5. Run the test suite:  
   `npm test` or `npm run vitest`
6. Commit with clear messages (semantic style preferred):  
   `fix: normalize words to lowercase in buildDictionary`  
   `feat: add CLI flag for lowercase normalization`  
   `docs: improve contributing guide`  
   `test: add cases for empty input and literals`
7. Push your branch and open a pull request against `main`

Small, focused PRs are usually merged quickly.  
Larger changes might be reviewed in stages — feel free to open a draft PR early to discuss.

### Good First Issues

Looking for an easy entry point? These tasks are beginner-friendly:

- Improve/fix documentation or README examples
- Add case normalization (lowercase) to dictionary building
- Create a smaller curated dictionary (e.g. top 10k–50k English words)
- Add more helpful messages or progress indicators to the CLI
- Write tests for edge cases (empty strings, very long phrases, invalid base64)
- Create a simple browser demo (CodeSandbox, StackBlitz, or static HTML)

Look for issues labeled **[good first issue]** on GitHub.

## Development Setup

```bash
# 1. Fork & clone the repo
git clone https://github.com/bigdreamsweb3/wordbin.git
cd wordbin

# 2. Install dependencies
npm install

# 3. Build the library
npm run build

# 4. Run tests
npm test
# or watch mode:
npm run vitest

# 5. Build dictionaries (optional)
npx wordbin build --version 2
# or interactive mode:
npx wordbin build
```

Main source code lives in `src/`.  
Generated dictionaries appear in `data/`.

## Current Priorities (2026)

These improvements would have the biggest impact right now:

- Case-insensitive dictionaries (normalize to lowercase during build)
- Smaller curated dictionaries (top 10k–50k words, programming keywords, domain-specific lists…)
- Performance & compression benchmarks across dictionaries and phrase lengths
- Interactive browser demo (CodeSandbox / StackBlitz / simple HTML page)
- CLI enhancements (progress bars, `--lowercase`, `--output-dir`, better help)
- Better error handling & messages (missing dictionary, invalid input, etc.)

If you're unsure where to begin — feel free to ask in an issue or draft PR!

## Code Style & Conventions

- ESM syntax (`import` / `export`)
- TypeScript where possible
- Vitest for testing
- Prefer async/await
- Small, focused functions
- JSDoc comments for public APIs

We use **Prettier** + **ESLint** — run these before committing:

```bash
npm run lint
npm run format
```

## License

By contributing your code to this project, you agree that it will be licensed under the same [MIT License](./LICENSE) as the rest of the project.

Thank you for helping make WordBin better!
