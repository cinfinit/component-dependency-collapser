# 📦 Component Dependency Collapser

> 🕵️ Unravel your frontend dependencies like a pro detective.  
> 🧠 Get insights. 🔍 Trace dependencies. 🌲 Visualize trees.  
> 💥 Bust bloat, debug spaghetti, and debug your bundle... before it debugs you.

---

## 🚀 What is this?

**Component Dependency Collapser** is your personal CLI x-ray tool for frontend projects. It's here to **analyze**, **trace**, and **visualize** how your code talks to itself.

Think of it as:
- 🕶️ Ray-Bans for your code structure.
- 🧬 DNA testing for your imports.
- 🧹 A Roomba for your dependency mess.

It answers:
- What does this file depend on?
- Who’s importing what?
- Why is this thing so heavy?
- Who dragged `moment.js` in here again?

---

## 🤔 Why Use This?

Ever sat in a dev meeting wondering:

- “Why is our bundle size over 3MB again?”
- “Where is this package even used?”
- “Who imported `lodash` just for `cloneDeep`?”
- “Why does this component have 19 parents?”

You’ve got questions. This tool’s got import receipts.

---

## 💡 Use Cases

- **🏋️ Performance busting:** Catch large transitive dependency chains red-handed.
- **🕵️ Code auditing:** Reveal suspicious and unnecessary imports.
- **🧼 Code cleanup:** Find unused or oversized components and kill the cruft.
- **🧭 Developer onboarding:** Help new teammates understand architecture—fast.
- **🧠 Refactoring support:** Don’t refactor blind—know the dependency blast radius.

---

## ⚙️ Installation

```bash
npm install -g component-dependency-collapser
# or
yarn global add component-dependency-collapser
```

## 🛠️ CLI Usage
```bash
comp-collapse <Dir> [options]
```

### Options

- `--tree` or `-t`: Print a tree of imports for each file.
- `--find <package>`: Find which components use a specific package
- `--external-only`: Only show external imports.
- `--trace <target>`: Trace import chains to a target module/package
- `--size`: Print the size of each file.
- `--help`: Show help.

## Examples

#### 1. Analyze Components in a Directory
```bash
comp-collapse src/components
```
Scans all files under src/components and lists their imports.

#### 2. Visual Dependency Tree Output
```bash
comp-collapse src/pages --tree
```
Visualizes each component’s internal & external imports with tree indentation.

#### 3. External Packages Only
```bash
comp-collapse src/components --tree --external-only
```
Shows a dependency tree only including external npm packages.

#### 4. Find Where a Package is Imported
```bash
comp-collapse src/ --find lodash
```
Finds and lists all components in src/ that import lodash.

#### 5. Trace Import Chains to a Target Module
```bash
comp-collapse src/ --trace react-query
```
Prints full import chains that lead to usage of react-query.

#### 6. Show Size of Components + Dependencies
```bash
comp-collapse src/components --size
```
Ranks components based on their total size including transitive dependencies.

## 👨‍💻🕶️  Author

Made by [Cinfinite](https://github.com/cinfinite), who once tried to delete a dependency... and accidentally broke 47 files. i guess it was more ... ANYWAYSSSS..

He's 
Fixer of imports.  
Breaker of chains.  
Writer of CLIs.
- Favorite emoji: 🔥 (usually right before deleting things) from Prod ? You guess that yourself .
- Years of experience: Enough to know better, too stubborn to stop.
- Number of times asked “who imports this?”: too many
- Number of regrets: zero 

> “No import shall escape my gaze.”

> If you’ve ever yelled “WHO’S USING THIS PACKAGE?!” — this is for you.