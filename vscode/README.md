## Humal

Humal language support for VS Code. Humal is a programming language with human-readable syntax that uses indentation (like Python) and compiles directly to JavaScript (supporting both ESM and CommonJS standards).

## What's inside

With this extension, you get full editor support: syntax highlighting, indentation handling, snippets, autocomplete, tooltips, and an icon for `.hum` files.


## Syntax

```bash
print "Welcome to Humal!"

// Variables
let name = "Roma"
let age = 25
let city = "Warsaw"

print name
print age
print city

// Math
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

// Conditional statement
let years = 20

if years >= 18
    print "Adult"
else
    print "Underage"

// Additional conditional branches
let score = 75

if score >= 90
    print "Excellent"
elif score >= 70
    print "Good"
elif score >= 50
    print "Pass"
else
    print "Fail"

// Loop
let i = 0

while i < 5
    print i
    i++

// Loop exit statement
let counter = 0

while true
    if counter >= 5
        break

    print counter
    counter++

// Next-iteration statement
let numbers = [1, 2, 3, 4, 5]

for number in numbers
    if number == 3
        continue

    print number

// Functions
fn greet(name)
    print "Hello " + name

greet("Roma")
greet("Alex")

// Function with return
fn add(a, b)
    return a + b

let result = add(10, 20)
print result

// Input
let user = input "What is your name? "

print "Hello " + user

// destructuring
let user = { name: "Bob", age: 25 }

let { name, age } = user

print name
print age
```