# cURL API

Cloudflare worker that parses the /{urlencoded-curl-request}, executes it with fetch, and returns the full parsed response.

Motivation: Provide a universal tool for LLM to use HTTP. Together with knowledge on how APIs work such as [OpenAPI](https://github.com/OAI/OpenAPI-Specification), [Agents JSON](https://github.com/wild-card-ai/agents-json) or [SLOP](https://github.com/agnt-gg/slop), this provides the LLM all that is needed to use HTTP APIs.

# CURL Executor API

This API lets you run CURL commands through a REST interface.

## Basic Usage

Send a GET request to:
`YOUR_SERVER_URL/{encodedCurlCommand}`

Where `{encodedCurlCommand}` is your CURL command URL-encoded.

Example: `YOUR_SERVER_URL/curl%20https%3A%2F%2Fexample.com`

## Response Format

If successful (200):

- `status`: HTTP status code from your request
- `statusText`: Status text (like "OK")
- `headers`: All response headers
- `body`: Response body (text or JSON)

## Error Responses

- 400: Bad request - Invalid CURL command or too long
- 403: Forbidden - URL not allowed for security reasons
- 405: Method not allowed - Only GET requests supported
- 500: Server error during execution

## Limitations

- Only GET requests to the API are supported (though your CURL command can use any HTTP method)
- Certain URLs may be blocked for security

## How to try this with an LLM

- Host this yourself at your cloudflare (there is no auth, so please do this at a covert URL, or add your own auth)
- You can use this as a tool. The easiest way is to make a GPT using ChatGPT and use the OpenAPI defined at [public/openapi.json](public/openapi.json) with YOUR_SERVER_URL replaced.
- If you want to try it using MCP (the last MCP you need), see https://github.com/mcp-get/community-servers/tree/main/src/server-curl
