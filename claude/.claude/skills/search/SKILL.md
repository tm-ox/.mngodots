---
name: search
description: Search the web using the local SearXNG instance and respond to the query
---

# Search

Search the web using the local SearXNG instance and respond to the query.

## Steps

1. Run the search:
```bash
curl -s "http://localhost:8080/search?q=QUERY&format=json" | jq '[.results[:5] | .[] | {title, url, content}]'
```

2. Parse the JSON results with jq — extract `title`, `url`, and `content` from the top 5 results.

3. Synthesize the results into a concise markdown response that directly answers the query. Do not just list results — interpret and summarize them. Cite sources inline as `[title](url)`.

## Usage

/search <query>
