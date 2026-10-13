# Global search

**Audience:** End user, Manager, Admin  
**Access path:** Top bar → search field / search icon  
**Requires:** Signed-in session. Ticket hits appear only when **Enable Internal Ticket System** (`internalTicketsEnabled`) is on.  
**When missing:** On very small widths the search control may be collapsed — widen the browser. Customer portal users get a limited data scope (their customer only).


## Purpose

Jump to a task, ticket, project, organization, or user without browsing list pages. Results update as you type (debounced) and group by category.

```mermaid
flowchart TD
  A[Focus search in top bar] --> B[Type name / key / fragment]
  B --> C[Debounced query]
  C --> D{Results}
  D -->|Tasks| T[Open project?task=… / task modal]
  D -->|Tickets| K[/tickets/:id]
  D -->|Projects| P[/projects/:id]
  D -->|Organizations| O[/organizations/:id]
  D -->|Users| U[/users/:id]
  D -->|Empty| E[No results message]
  C --> L[Load more if offered]
```


## 1 — Run a search

1. Click the **search** control in the top bar (desktop).
2. Type part of a **task name**, **ticket title/number**, **project name**, **organization name**, or **person** (name / username / email fragment).
3. Wait briefly — results refresh as you type; you do not need to press Enter.
4. Scan categories in the dropdown.
5. Click a row to navigate.

![Global search results](../media/docs-getting-started-search.png)

> **SCREENSHOT** — Capture search dropdown with mixed result types (Tasks, Projects, Users).
> File to add: `media/docs-getting-started-search.png`


## 2 — Result categories

| Category | What you see | Where click goes |
|----------|--------------|------------------|
| **Tasks** | Task name · project · status | Project with `?task=` (opens task detail when the project page handles it), or projects list with `?task=` |
| **Tickets** | Ticket number · title · project/org · status | `/tickets/:id` — **hidden entirely** when internal tickets are disabled |
| **Projects** | Project name · organization · status | `/projects/:id` |
| **Organizations** | Name · description snippet | `/organizations/:id` |
| **Users** | Full name · @username · email | `/users/:id` |

Ticket rows are not shown when `internalTicketsEnabled` is false — even if older data exists.


## 3 — Load more

1. When more matches exist, use **Load More** at the top of the results panel.
2. Wait for the next page of hits; the button disables while loading.
3. Continue clicking until no more pages remain.


## 4 — Empty and edge cases

| Situation | What to do |
|-----------|------------|
| “No results found for …” | Try fewer characters, alternate spelling, or search from the entity list page filters |
| You know the task but it is in another org | Confirm membership; search respects what your account can see |
| Ticket missing from results | Check [[02-settings/feature-toggles-overview]] — internal tickets may be off |
| Portal user | Expect only data for your customer; internal org/user catalogs are not a portal feature |


## Tips

- Prefer search when you remember a distinctive title or ticket number.
- For assignees and status filters on large lists, use the module’s own filters after you land.
- Searchable dropdowns inside forms (`SearchableSelect`) are separate from global search — they only filter that field’s options.


## Done criteria

- You can open a task and a project from search in under two tries.
- You understand tickets disappear from search when the internal ticket system is disabled.
- You know how to use Load More on large result sets.


## Related

- [[01-getting-started/navigation]]
- [[03-modules/projects-and-tasks]]
- [[03-modules/tickets]]
- [[01-getting-started/what-you-see-depends-on-settings]]
