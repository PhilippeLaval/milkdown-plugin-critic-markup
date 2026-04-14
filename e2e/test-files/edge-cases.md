# Edge Cases

## Empty-ish content

Insertion of space: {++ ++}between words.

## Single character operations

Add {++a++} letter. Remove {--x--} letter. Replace {~~a~>b~~} letter.

## Very long content in markup

{++Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.++}

{--Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.--}

## Multiple types on same line

I {--removed--}{++added++} and {==highlighted==} with a note{>>comment here<<}.

## All five types in one paragraph

The {~~old~>new~~} document was {++carefully++} reviewed. Some sections were {--unnecessarily--} verbose. The {==key finding==} was noted.{>>Needs peer review before publication.<<}

## Nested formatting with critic markup

The **{++bold insertion++}** and *{--italic deletion--}* work together.

## Numbers and symbols

The price changed from {~~$99.99~>$149.99~~} effective {++immediately++}.

## URLs and paths

Visit {~~http://old-site.com~>https://new-site.com~~} for details.

## Consecutive operations without space

Word{++s++} and {--un--}do and re{~~do~>make~~}.

## Critic markup in headings

## The {~~Old~>New~~} Chapter Title

## Paragraph with many changes

The {~~original~>revised~~} manuscript {++now++} contains {--several--} {++numerous++} improvements. The {==methodology section==} was {~~completely rewritten~>substantially updated~~} to reflect {++current++} best practices.{>>This paragraph has been heavily edited - consider a full rewrite for clarity.<<}
