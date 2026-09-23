import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { bangs } from "../src/bang.ts";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../src/main.ts", import.meta.url), "utf8").replace(
    /^import .*;\n/gm,
    "",
  ),
);

function redirectFor(query, defaultBang) {
  let destination;
  const localStorage = {
    getItem(key) {
      assert.equal(key, "default-bang");
      return defaultBang ?? null;
    },
  };
  const window = {
    location: {
      href: `https://unduck.link/?q=${encodeURIComponent(query)}`,
      replace(url) {
        destination = url;
      },
    },
  };

  runInNewContext(source, { bangs, localStorage, window, URL, document: {} });
  return destination;
}

test("ordinary Google searches use Web mode without changing the query", () => {
  for (const query of ["cats", "two words", "café & tea/coffee"]) {
    const destination = new URL(redirectFor(query));
    assert.equal(destination.origin, "https://www.google.com");
    assert.equal(destination.pathname, "/search");
    assert.equal(destination.searchParams.get("q"), query);
    assert.equal(destination.searchParams.get("udm"), "14");
  }
});

test("recognized bangs keep their catalog URLs", () => {
  const expected = [
    ["!g two words", "https://www.google.com/search?q=two%20words"],
    ["!gh two words", "https://github.com/search?utf8=%E2%9C%93&q=two%20words"],
    ["!yt two words", "https://www.youtube.com/results?search_query=two%20words"],
    ["!w two words", "https://en.wikipedia.org/wiki/Special:Search?search=two%20words"],
  ];
  for (const [query, url] of expected) {
    assert.equal(redirectFor(query), url);
  }
});

test("unknown bangs use the existing default and remove the unknown token", () => {
  assert.equal(
    redirectFor("!not-a-bang two words"),
    "https://www.google.com/search?q=two%20words&udm=14",
  );
});

test("a saved non-Google default remains the fallback", () => {
  assert.equal(
    redirectFor("two words", "gh"),
    "https://github.com/search?utf8=%E2%9C%93&q=two%20words",
  );
  assert.equal(
    redirectFor("!g two words", "gh"),
    "https://www.google.com/search?q=two%20words",
  );
});
