<p align="center">
  <img src="./assets/image/humal-logo.png" alt="Humal" width="55%">
</p>

# Humal

Humal is a programming language with human-readable syntax that uses indentation (like Python) and compiles directly to JavaScript (supporting both ESM and CommonJS standards).

Humal does not add new semantics. It removes the punctuation you don't need:
no `{}`, no `;`, no `:` after conditions. Everything else is JavaScript.

In Humal's basic syntax, the use of curly and round brackets is optional they can be included or omitted. However, a minimal amount of them is required when working with complex functions, specific methods, and library calls. **Humal does not aim to replace JavaScript; instead, the language is designed to make the syntax cleaner, more elegant, and easier to read and understand.**

In basic Humal syntax, square and round brackets are optional meaning they can be used or omitted. However, they are required to a minimal extent in complex functions, specific methods, and library calls. **Humal does not aim to replace JavaScript; instead, it seeks to make the syntax cleaner, more elegant, and easier to read and understand.**

## How it works

No AST, no parser, no braces for blocks, no semicolons, no colons after control statements. String literals and comments are left untouched, so a keyword inside a string stays a string

The core idea is simple. Humal retains familiar JavaScript syntax but removes unnecessary punctuation and uses indentation to define code blocks, resulting in cleaner code that is easier to learn and understand.

## Install the VS Code extension

Download the `.vsix` file, then in VS Code go to the **Extensions** view, click the **three dots**, select **Install from VSIX...**, and choose the downloaded `.vsix` file.

## Install

Install Humal globally:

```bash
npm install -g @qvelop444/humal
```

You can also install Humal locally in a project:

```bash
npm install --save-dev @qvelop444/humal
```

## Create a Humal Project

Create a new Humal project:

```bash
humal init my-app
cd my-app
npm install
```
Start the development environment:

```bash
humal dev
```

This creates a basic project structure:

```text
my-app/
├── src/
│   └── main.hum
├── humal.config.json
├── package.json
└── .gitignore
```

## CLI Commands

Run a Humal file directly:

```bash
humal test.hum
```

Use CommonJS:

```bash
humal build test.hum --cjs
```

Use ESM:

```bash
humal build test.hum --esm
```

Check your Humal project with TypeScript and ESLint:

```bash
humal check
```

Build the project:

```bash
humal build
```

Watch Humal files for changes:

```bash
humal watch
```

Start development mode with automatic rebuilding and restarting:

```bash
humal dev
```

Format Humal files:

```bash
humal fmt
```

When no module format is specified, Humal can detect the format from the source code.

## Basic Syntax

### Print
```bash
print "Hello World!"
```

### Variables
```bash
let name = "Bob"
let age = 25
let city = "Warsaw"

print name
print age
print city
```

### Math
```bash
let a = 10
let b = 5

let sum = a + b
let difference = a - b
let product = a * b
let division = a / b

print sum
print difference
print product
print division
```

### Conditional statement
```bash
let years = 20

if years >= 18
    print "Adult"
else
    print "Underage"
```

### Additional conditional branches
```bash
let score = 75

if score >= 90
    print "Excellent"
elif score >= 70
    print "Good"
elif score >= 50
    print "Pass"
else
    print "Fail"
```

### Loop
```bash
let i = 0

while i < 5
    print i
    i++
```

### Loop exit statement
```bash
let counter = 0

while true
    if counter >= 5
        break

    print counter
    counter++
```

### Next-iteration statement
```bash
let numbers = [1, 2, 3, 4, 5]

for number in numbers
    if number == 3
        continue

    print number
```

### Functions
```bash
fn greet(name)
    print "Hello " + name

greet("Bob")
greet("Alex")
```

### Function with return
```bash
fn add(a, b)
    return a + b

let result = add(10, 20)
print result
```

### Input
```bash
let user = input "What is your name? "

print "Hello " + user
```

### destructuring

```bash
let user = { name: "Bob", age: 25 }

let { name, age } = user

print name
print age
```
### Basic switch
```bash
let value = 2

switch value
    case 1
        print "one"
        break

    case 2
        print "two"
        break

    default
        print "other"
```
### Multiple case labels
```bash
let value = 2

switch value
    case 1
    case 2
    case 3
        print "one, two or three"
        break

    default
        print "other"
```
### Expressions in case
```bash
let value = 10

switch value
    case 5 + 5
        print "expression works"
        break

    default
        print "no match"
```

More code examples and full documentation can be found on the official website: https://humal.netlify.app
