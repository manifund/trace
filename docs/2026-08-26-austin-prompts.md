I'd like to revamp the design of the site, while also bringing it to use more standardized/modern components, most likely shadcn

1. Explore what alternatives there are to shadcn for this and make a recommendation
2. Default home table should:

- Always be one line
- Be less duplicative of info
- Look more like a spreadsheet/tabular
- Generally be more condensed
- Most important columns first: Date, then Purpose, then Funder, then Amount
- Combine Via and Source
- Edit should be a small pencil icon from heroicon

Ask me any questions you have before starting.

---

in a new worktree from main, i'd like you to ponder how to make this entire thing lightning-fast, improving on the default "Load stuff
from sql and cache with nextjs":

- my guess is that we're basically reading the whole table from supabase for eg the recipients page
- i kind of wonder what the size of the whole db is; if it makes sense to send over on first load in some kind of compact format?
  because it's not that much data in the grand scheme of things
- it's kind of fine to roll our own sync engine but if there are other established options that are also simple (don't bloat our
  stack), good to know
- fundamentally, we're not adding a lot of new grants (would even be okay if it updated eg daily, but we can probably do better); so
  design for lots of fast reads, and also a really fast
- very inspired by https://github.com/ekzhang/classes.wtf. obviously we don't need to go that far, but it's a good inspiration
- at the same time, want to balance against being simple to maintain and extensible -- this whole thing is still very experimental and
  might change a bunch. in service of that, less code = good.
