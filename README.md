# cURL API

Cloudflare worker that parses the /{urlencoded-curl-request}, executes it with fetch, and returns the full parsed response.

Motivation: Provide a universal tool for LLM to use HTTP. Together with knowledge on how APIs work such as [OpenAPI](https://github.com/OAI/OpenAPI-Specification), [Agents JSON](https://github.com/wild-card-ai/agents-json) or [SLOP](https://github.com/agnt-gg/slop), this provides the LLM all that is needed to use HTTP APIs.

## How to try this with an LLM

- Host this yourself at your cloudflare (there is no auth, so please do this at a covert URL, or add your own auth)
- You can use this as a tool. The easiest way is to make a GPT using ChatGPT and use the OpenAPI defined at [public/openapi.json](public/openapi.json) with YOUR_SERVER_URL replaced.
