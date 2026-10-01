<p align="center">
  <img src="./assets/image/humal-logo.png" alt="Humal" width="55%">
</p>

# Humal

Humal is a programming language with human-readable syntax that uses indentation (like Python) and compiles directly to JavaScript (supporting both ESM and CommonJS standards).

Humal does not add new semantics. It removes the punctuation you don't need:
no `{}`, no `;`, no `:` after conditions. Everything else is JavaScript.

In Humal's basic syntax, the use of curly and round brackets is optional they can be included or omitted. However, a minimal amount of them is required when working with complex functions, specific methods, and library calls. **Humal does not aim to replace JavaScript; instead, the language is designed to make the syntax cleaner, more elegant, and easier to read and understand.**

## How it works

No AST, no parser, no braces for blocks, no semicolons, no colons after control statements. String literals and comments are left untouched, so a keyword inside a string stays a string

The core idea is simple. Humal retains familiar JavaScript syntax but removes unnecessary punctuation and uses indentation to define code blocks, resulting in cleaner code that is easier to learn and understand.

## Install the VS Code extension

Download the `.vsix` file, then in VS Code go to the **Extensions** view, click the **three dots**, select **Install from VSIX...**, and choose the downloaded `.vsix` file.

## Install

```bash
npm install -g @qvelop444/humal
```

## Usage

Run a Humal file:

```bash
humal test.hum
```

Build the Humal file into the CommonJS standard:

```bash
humal build test.hum --cjs
```

Build the Humal file into the ESM standard

```bash
humal build test.hum --esm
```

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
