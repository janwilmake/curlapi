const scan = (
  string: string,
  pattern: RegExp,
  callback: (match: RegExpMatchArray) => void,
) => {
  let result = "";

  while (string.length > 0) {
    const match = string.match(pattern);

    if (match && match.index != null && match[0] != null) {
      result += string.slice(0, match.index);
      result += callback(match);
      string = string.slice(match.index + match[0].length);
    } else {
      result += string;
      string = "";
    }
  }

  return result;
};

/**
 * Splits a string into an array of tokens in the same way the UNIX Bourne shell does.
 *
 * @param line A string to split.
 * @returns An array of the split tokens.
 */
const split = (line: string = "") => {
  const words: string[] = [];
  let field = "";
  scan(
    line,
    /\s*(?:([^\s\\\'\"]+)|'((?:[^\'\\]|\\.)*)'|"((?:[^\"\\]|\\.)*)"|(\\.?)|(\S))(\s|$)?/,
    (match) => {
      const [_raw, word, sq, dq, escape, garbage, separator] = match;

      if (garbage != null) {
        throw new Error(`Unmatched quote: ${line}`);
      }

      if (word) {
        field += word;
      } else {
        let addition;

        if (sq) {
          addition = sq;
        } else if (dq) {
          addition = dq;
        } else if (escape) {
          addition = escape;
        }

        if (addition) {
          field += addition.replace(/\\(?=.)/, "");
        }
      }

      if (separator != null) {
        words.push(field);
        field = "";
      }
    },
  );

  if (field) {
    words.push(field);
  }

  return words;
};

/**
 * Interface for the parsed curl command output
 */
interface ParsedCurl {
  url?: string;
  method: string;
  header: Record<string, string>;
  body?: string;
}

/**
 * Types of states for the parser
 */
type ParserState =
  | ""
  | "header"
  | "user-agent"
  | "data"
  | "user"
  | "method"
  | "cookie";

/**
 * Attempt to parse the given curl string.
 * @param s - The curl command string to parse
 * @returns ParsedCurl object or undefined if not a curl command
 */
function parseCurl(s: string): ParsedCurl | undefined {
  if (!s.startsWith("curl ")) return undefined;

  const args = rewrite(split(s));
  const out: ParsedCurl = { method: "GET", header: {} };
  let state: ParserState = "";

  args.forEach((arg: string) => {
    switch (true) {
      case isURL(arg):
        out.url = arg;
        break;

      case arg === "-A" || arg === "--user-agent":
        state = "user-agent";
        break;

      case arg === "-H" || arg === "--header":
        state = "header";
        break;

      case arg === "-d" ||
        arg === "--data" ||
        arg === "--data-ascii" ||
        arg === "--data-binary":
        state = "data";
        break;

      case arg === "-u" || arg === "--user":
        state = "user";
        break;

      case arg === "-I" || arg === "--head":
        out.method = "HEAD";
        break;

      case arg === "-X" || arg === "--request":
        state = "method";
        break;

      case arg === "-b" || arg === "--cookie":
        state = "cookie";
        break;

      case arg === "--compressed":
        out.header["Accept-Encoding"] =
          out.header["Accept-Encoding"] || "deflate, gzip";
        break;

      case !!arg:
        switch (state) {
          case "header":
            const field = parseField(arg);
            if (field.length >= 2) {
              out.header[field[0]] = field[1];
            }
            state = "";
            break;

          case "user-agent":
            out.header["User-Agent"] = arg;
            state = "";
            break;

          case "data":
            if (out.method === "GET" || out.method === "HEAD")
              out.method = "POST";
            out.header["Content-Type"] =
              out.header["Content-Type"] || "application/x-www-form-urlencoded";
            out.body = out.body ? out.body + "&" + arg : arg;
            state = "";
            break;

          case "user":
            out.header["Authorization"] = "Basic " + btoa(arg);
            state = "";
            break;

          case "method":
            out.method = arg;
            state = "";
            break;

          case "cookie":
            out.header["Set-Cookie"] = arg;
            state = "";
            break;
        }
        break;
    }
  });

  return out;
}

/**
 * Rewrite args for special cases such as -XPUT.
 * @param args - Array of command arguments
 * @returns Rewritten array of arguments
 */
function rewrite(args: string[]): string[] {
  return args.reduce((newArgs: string[], arg: string) => {
    if (arg.startsWith("-X")) {
      newArgs.push("-X");
      newArgs.push(arg.slice(2));
    } else {
      newArgs.push(arg);
    }
    return newArgs;
  }, []);
}

/**
 * Parse header field.
 * @param s - Header string in format "Name: Value"
 * @returns Array containing name and value of the header
 */
function parseField(s: string): string[] {
  return s.split(/: (.+)/);
}

/**
 * Check if `s` looks like a url.
 * @param s - String to check
 * @returns Boolean indicating if string looks like a URL
 */
function isURL(s: string): boolean {
  return /^(https?|ftp|file):\/\//.test(s);
}

/**
 * Execute the parsed curl command using fetch
 * @param parsed - The parsed curl command
 * @returns Promise with the response
 */
async function executeCurl(parsed: ParsedCurl): Promise<Response> {
  if (!parsed.url) {
    return new Response(
      JSON.stringify({ error: "No URL provided in curl command" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const options: RequestInit = {
    method: parsed.method,
    headers: parsed.header,
  };

  if (parsed.body) {
    options.body = parsed.body;
  }

  try {
    const response = await fetch(parsed.url, options);

    // Get response body
    const contentType = response.headers.get("Content-Type") || "";
    let body;

    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    // Create response object with status, headers, and body
    const result = {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: body,
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ parsed, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    // Enable CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Only handle GET requests
    if (request.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Check if it's the root path
    if (path === "/" || path === "") {
      return new Response(
        JSON.stringify({
          message: "CURL Executor API",
          usage: "GET /{urlencoded_curl_command}",
        }),
        {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    try {
      // Decode the base64 URL encoded curl command
      const encodedCommand = path.substring(1); // Remove the leading slash
      const decodedCommand = decodeURIComponent(encodedCommand);

      // Prevent abuse by limiting command length
      if (decodedCommand.length > 2000) {
        return new Response(JSON.stringify({ error: "Command too long" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Parse the curl command
      const parsed = parseCurl(decodedCommand);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "Invalid curl command" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      // Add security checks
      if (parsed.url && !isAllowedURL(parsed.url)) {
        return new Response(
          JSON.stringify({ error: "URL not allowed for security reasons" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          },
        );
      }

      // Execute the command
      const response = await executeCurl(parsed);

      // Add CORS header to the response
      const newHeaders = new Headers(response.headers);
      newHeaders.set("Access-Control-Allow-Origin", "*");

      return new Response(response.body, {
        status: response.status,
        headers: newHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message || "An error occurred" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }
  },
};

/**
 * Security function to check if URL is allowed
 * @param url - URL to check
 * @returns Boolean indicating if URL is allowed
 */
function isAllowedURL(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    // Block requests to internal services
    if (
      parsedUrl.hostname === "localhost" ||
      parsedUrl.hostname === "127.0.0.1" ||
      parsedUrl.hostname.startsWith("192.168.") ||
      parsedUrl.hostname.startsWith("10.") ||
      parsedUrl.hostname.endsWith(".local") ||
      parsedUrl.hostname.endsWith(".internal")
    ) {
      return false;
    }

    // Allow only HTTP and HTTPS
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return false;
    }

    return true;
  } catch (error) {
    return false;
  }
}
