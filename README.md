# Milkman Moo - Monthly Milk & Newspaper Bill Calculator
Open `index.html` in a browser. No install needed.

## Assumptions
- A day left blank is "not logged"; only an explicit 0 counts as a missed day.
- Rate change: set "New rate" and "from day"; later days use it, earlier days keep the old rate. The bill itemises litres per rate.
- Newspaper is charged on logged days that are ticked; Sunday has its own optional rate.
- Late days are flagged and counted only; they do not change the bill.
- Balance due = total bill minus advance paid.
- Data is saved in the browser (localStorage), per month.

## Pages
- `index.html` is the home page (type the vendor name, then start).
- `calculator.html` is the monthly calculator.
