/* =====================================================================
 *  常用句子 Sentence banks (the same file is in both typing games)
 *
 *  Each line is typed exactly as written: capitals, spaces, punctuation and symbols.
 *  A capital or symbol that needs Shift counts as 2 key presses.
 *  Rules: plain keyboard characters only (straight quotes ' and "), at most 46 characters,
 *  one space between words. Banks named line_... are sentences, code_... are code lines
 *  (the typing test uses a different full-marks speed for each, see TestSettings).
 *  To add a line: put it on its own line inside the backticks.
 * ===================================================================== */
window.SENTENCE_BANKS = {
  line_everyday: { name: "Sentences · Everyday", lines: String.raw`
The quick brown fox jumps over the lazy dog.
My sister reads a book before bed.
We went to the beach on Sunday morning.
Please close the door when you leave.
How many apples are in the basket?
I have two cats, one dog and a fish.
The bus arrives at 7:30 every morning.
Can you help me carry this box?
Our class has 42 students this year.
She likes tea, but he likes coffee.
Turn off the lights to save energy.
The library opens at 8 and closes at 5.
Wash your hands before you eat.
It rained all day, so we stayed home.
Where did you put my blue pencil?
Malaysia has 13 states and 3 territories.
A week has 7 days and a year has 12 months.
Kuala Lumpur is the capital of Malaysia.
Johor Bahru is in the south of Malaysia.
Practice makes perfect, so keep typing.
Save your work before you shut down.
Always back up your important files.
Never share your password with anyone.
Press Ctrl and S to save the file.
The Internet connects computers worldwide.
A keyboard has letters, numbers and symbols.
Keep your back straight when you type.
Use all ten fingers, not just two.
Look at the screen, not at the keys.
Slow and steady wins the race.
Thank you for helping me yesterday.
What time does the movie start tonight?
My father drives to work at 6:45.
We planted 20 trees behind the school.
The test starts at 10 and ends at 11.
Reading every day improves your English.
Is this your bag, or is it mine?
Open the window, it is very hot today.
There are 60 minutes in one hour.
I finished my homework before dinner.
The teacher asked us to work in pairs.
Our team won the match by 3 goals.
Mix red and yellow to make orange.
Water boils at 100 degrees Celsius.
The Earth goes around the Sun once a year.
An email needs a clear subject line.
Check your spelling before you send it.
Good typing saves a lot of time.
Hello, my name is Alex. What is yours?
Bring an umbrella, it may rain later.
` },

  line_j2: { name: "Sentences · J2 micro:bit", lines: String.raw`
The micro:bit has 25 red LEDs.
Press button A to show a smiley face.
Press button B to clear the screen.
Shake the micro:bit to roll a dice.
The forever block repeats the code inside.
The on start block runs only once.
Drag blocks from the toolbox to the editor.
Click Download to save the .hex file.
Plug the micro:bit into a USB port.
Copy the .hex file to the MICROBIT drive.
Test your code in the simulator first.
Use show number to display the score.
Use show string to scroll a message.
Show icon Heart draws a heart on the LEDs.
The pause block waits in milliseconds.
Pause 1000 ms means wait for one second.
A variable stores a value that can change.
Change score by 1 when button A is pressed.
Use if, then, else to make a choice.
Pick random 1 to 6 gives a dice number.
Plot x 2, y 2 lights the middle LED.
Unplot turns one LED off again.
The light level sensor reads 0 to 255.
The accelerometer knows when you tilt it.
The compass shows which way is north.
The temperature block shows degrees Celsius.
Touch the gold logo to start the game.
Play a tone at Middle C for 1 beat.
Set the radio group to the same number.
Send a number to a friend by radio.
On radio received runs when data arrives.
Use a repeat loop to count from 0 to 4.
Pin P0 can read a button or a sensor.
Two AAA batteries can power the micro:bit.
The JavaScript tab shows the same code.
` },

  line_j3: { name: "Sentences · J3 Illustrator + Excel", lines: String.raw`
Use the Pen Tool to draw smooth curves.
Press V to pick the Selection Tool.
The Direct Selection Tool moves one anchor.
Each artboard is one page of the design.
Put text and shapes on separate layers.
Vector art stays sharp at any size.
Fill colours the inside of a shape.
Stroke is the outline around a shape.
Use Pathfinder to unite two shapes.
Press Ctrl+G to group the objects.
Hold Shift to draw a perfect circle.
Use the Align panel to centre the logo.
Export the poster as a PNG file.
Use CMYK colours for printing.
Use RGB colours for screens.
The Gradient Tool blends two colours.
Image Trace turns a photo into vectors.
Create Outlines turns text into shapes.
A clipping mask hides part of a picture.
Lock a layer so it does not move.
Ctrl+Z undoes the last step.
Kerning is the space between two letters.
The Eyedropper copies a colour.
Save the file as .ai to edit it later.
A cell is where a row meets a column.
Every formula starts with an = sign.
SUM adds up the numbers in a range.
AVERAGE finds the mean of the numbers.
Drag the fill handle to copy a formula.
A pie chart shows the parts of a whole.
Sort the marks from highest to lowest.
Use a filter to show only one class.
` },

  line_s1: { name: "Sentences · S1 Excel", lines: String.raw`
A cell is where a row meets a column.
Every formula starts with an = sign.
A1:A10 means the cells from A1 to A10.
SUM adds up the numbers in a range.
AVERAGE finds the mean of the numbers.
MAX finds the largest number in a range.
MIN finds the smallest number in a range.
COUNT counts the cells that have numbers.
COUNTIF counts the cells that match a rule.
IF checks a test and gives two answers.
VLOOKUP looks for a value in the 1st column.
ROUND keeps 2 decimal places.
Use $A$1 to keep a reference fixed.
Drag the fill handle to copy a formula.
Sort the list from largest to smallest.
Use a filter to show only one class.
A pie chart shows the parts of a whole.
A column chart compares the classes.
Freeze the top row so the headers stay.
Conditional formatting colours the cells.
Merge and Center joins cells for a title.
Wrap Text shows long text on many lines.
Press Ctrl+S to save the workbook.
A workbook can have many worksheets.
Rename the sheet tab to Marks.
A pivot table adds up data by group.
Data validation stops wrong input.
Show the price in RM with 2 decimals.
Press F4 to add the $ signs.
#DIV/0! means a number was divided by 0.
` },

  code_s2: { name: "Code lines · S2 C language", lines: String.raw`
#include <stdio.h>
int main() {
return 0;
int a, b, sum;
float average = 0.0;
char grade = 'A';
printf("Hello, World!\n");
printf("%d\n", x);
printf("Sum = %d\n", a + b);
printf("%.2f\n", average);
scanf("%d", &n);
scanf("%d %d", &a, &b);
sum = a + b;
average = (float)sum / n;
if (x > 0) {
} else if (x == 0) {
} else {
if (a >= 60 && a <= 100) {
if (n % 2 == 0) {
for (i = 0; i < 10; i++) {
for (i = 1; i <= n; i++) {
for (j = n; j > 0; j--) {
while (count < 5) {
while (n != 0) {
} while (x != -1);
count++;
total += score[i];
i = i + 2;
int score[5] = {90, 85, 70, 60, 95};
int max = score[0];
if (score[i] > max) max = score[i];
char name[20];
printf("Enter your name: ");
scanf("%s", name);
switch (choice) {
case 1: printf("One\n"); break;
default: printf("Other\n");
int add(int x, int y) {
return x + y;
result = add(3, 4);
void show(int n) {
#define SIZE 10
int temp = a; a = b; b = temp;
x = (a > b) ? a : b;
printf("%d x %d = %d\n", i, j, i * j);
if (ch == 'y' || ch == 'Y') {
n = n / 10;
digit = n % 10;
break;
continue;
int i, j, count = 0;
float price = 12.50;
printf("Total: %d\n", total);
` },
};
