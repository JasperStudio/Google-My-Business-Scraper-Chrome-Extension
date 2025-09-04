# Google Business Scraper (Chrome Extension)

A Manifest V3 Chrome extension that searches Google local results for a list of keywords (e.g., “plumbers New York”) and collects business details across result pages. Results are shown in the popup and can be exported to CSV.

## Features
- Multiple queries: paste one keyword per line; runs them sequentially
- Captures: name, website, phone, email (optional), address, social profiles (Facebook/Instagram/LinkedIn/Twitter/X/TikTok/YouTube)
- Pagination: traverses Google Local results pages per query (with safety cap)
- Dedupe: merges entries by website or name+phone
- CSV export: one row per unique business

## Install (unpacked)
1) Open `chrome://extensions`
2) Enable “Developer mode”
3) Click “Load unpacked” and select the `gmb-scraper/` folder

## Usage
1) Open the extension popup
2) Paste your queries (one per line)
3) Optional: check “Try to find email on websites” to fetch home pages and extract the first visible email + social profile links
4) Click Start; a minimized window will open to process results
5) Watch status and rows populate; click Export CSV when done

## Output columns
- `name`: Clean business name (rating/category/status removed)
- `website`: Direct URL (Google redirects unwrapped)
- `phone`: Best-effort extraction from the listing card
- `email`: First email found on the website HTML (optional)
- `address`: Heuristic address-like text near the listing
- `profiles`: Social profile links found in the listing and/or website HTML (pipe-separated)
- `query`: The originating search query

## How it works
- Background orchestrator opens Google Local search: `https://www.google.com/search?hl=en&q=<query>&tbm=lcl`
- A content script scrapes each page’s cards (prefers “Website” links); extracts name/phone/address, unwraps website URLs, locates the “Next” page
- Optional site fetch: the background requests runtime permission for each website origin and fetches the HTML to find the first email and social profile links
- Dedupe logic merges entries by website or name+phone
- Results stream back to the popup; CSV export saves `gmb-results.csv`

## Notes, limits, and caveats
- UI-dependent: Google Local markup varies by locale and may change; selectors are heuristic but robust. If results degrade, adjust `content/scrape_lcl.js`
- Pagination: safety limit of 50 pages per query (configurable in `bg/service-worker.js`)
- Emails: only the first detected email is captured; enable the option to fetch website HTML. Consider adding a “contact page” crawl if needed
- Social profiles: listing + website extraction covers common platforms; you can split profiles into separate columns if desired
- Permissions: the extension requests runtime origin permission for each website it fetches (when email/profiles option is enabled)

## Privacy
- All scraping runs locally in your browser; no third-party servers
- The extension does not persist results beyond the popup session unless you export CSV
- No analytics or telemetry

## Legal and ToS
- Use responsibly and in accordance with Google’s Terms of Service and local laws
- Websites may have usage restrictions; honor robots.txt and site policies as appropriate
- This tool is provided for research and operational convenience; you are responsible for compliance and rate considerations

## Development
- `manifest.json`: MV3 config and permissions
- `bg/service-worker.js`: Orchestrates queries, pagination, site fetching, de-duplication
- `content/scrape_lcl.js`: Extracts listings, next-page URL, cleans names, finds nearby phone/address and social links
- `ui/popup.*`: UI to input queries, show progress and results, export CSV

## Roadmap ideas
- Throttle control and per-query page cap setting
- Maps panel scraping variant
- Per-platform columns for profiles
- Contact page crawling (limited depth) and better email heuristics

## Troubleshooting
- Empty results: ensure you are on Google’s standard UI in your region; try `hl=en` results; selectors may need tweaking
- Few websites: some listings do not show a website link; fallback extraction tries to capture name/phone
- Missing emails: enable the website fetch option; some sites obfuscate emails or load them dynamically
- If Google UI changes, open an issue with a sample query and a screenshot/HTML snippet

---

This extension is provided as-is, without warranty. Contributions and improvements welcome!
