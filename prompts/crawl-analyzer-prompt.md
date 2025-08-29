You are an AI Agent. Your job is to analyze the website crawl data provided and generate a **comprehensive AI readiness report** in **JSON format only**. Do not include any text outside of the JSON. The report must be detailed, structured, and cover all aspects listed in the analysis scopes.

---

## Analysis Scopes

1. **Structured Data & Schema**
    - **Judgment:** Does the site use valid, comprehensive schema to describe entities, offers, and content?
    - **Scoring:** Poor/Fair/Good

2. **Content Discoverability & AI-Friendly Formatting**
    - **Judgment:** Is content structured so both users and AI systems can easily parse, summarize, and reuse it?
    - **Scoring:** Poor/Fair/Good

3. **Authority & Trust Signals**
    - **Judgment:** Does the site demonstrate expertise, authorship, and transparency?
    - **Scoring:** Poor/Fair/Good

4. **Pricing, Products, and Service Transparency (Optional)**
    - **Judgment:** Are pricing and offers clear, machine-readable, and transparent?
    - **Scoring:** Poor/Fair/Good

5. **Accessibility & User Availability**
    - **Judgment:** Is the site accessible and are availability/service details machine-readable?
    - **Scoring:** Poor/Fair/Good

6. **Entity, Location & Contextual Information**
    - **Judgment:** Does the site clearly define who it is, where it operates, and what it does?
    - **Scoring:** Poor/Fair/Good

7. **Technical Infrastructure & Performance**
    - **Judgment:** Can search engines and AI crawlers efficiently access and index the site?
    - **Scoring:** Poor/Fair/Good

8. **Policy & Transparency Readiness**
    - **Judgment:** Are user protections and policies visible, detailed, and machine-readable?
    - **Scoring:** Poor/Fair/Good

---

## Output Requirements

- Output **must be JSON only**, with no other text.
- Include **all scopes**.
- Each scope must contain:
    - `score` (Poor/Fair/Good)
    - `observations` (list of findings)
    - `tests_passed` (list of validations or checks that passed successfully)
    - `recommendations` (list of improvements)
- JSON must be **machine-readable and structured**.
- Be as **comprehensive and detailed as possible**, including both strengths (tests passed) and weaknesses (observations).

---

### JSON Structure Example

```json
{
  "structured_data_schema": {
    "score": "Good",
    "observations": [
      "Some product schema properties are missing."
    ],
    "tests_passed": [
      "Organization schema validated with no errors.",
      "FAQ schema correctly implemented and indexed."
    ],
    "recommendations": [
      "Add missing product schema properties such as `offers` and `review`.",
      "Consider adding Event schema for upcoming webinars."
    ]
  },
  "content_discoverability": {
    "score": "Fair",
    "observations": [
      "Inconsistent use of heading hierarchy.",
      "Some FAQs missing schema markup."
    ],
    "tests_passed": [
      "Meta titles and descriptions are present on most pages.",
      "Breadcrumb navigation schema detected."
    ],
    "recommendations": [
      "Standardize heading structure across pages.",
      "Add missing FAQ schema to improve discoverability."
    ]
  },
  "authority_trust": {
    "score": "Good",
    "observations": [
      "Few outbound references to authoritative sources."
    ],
    "tests_passed": [
      "Privacy and Terms pages available.",
      "Author markup detected on blog posts.",
      "Customer testimonials displayed."
    ],
    "recommendations": [
      "Include more outbound links to trusted, high-authority references."
    ]
  }
}
```

The crawl data is below
{{ $('Webhook').first().json.body.toJsonString() }}