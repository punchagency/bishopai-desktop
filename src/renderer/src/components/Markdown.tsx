import { marked, type Token, type Tokens } from 'marked';

// Renders the backend's rendered notes without ever handing raw HTML to the DOM.
//
// The markdown itself is written by our own renderers (server/src/session/render.ts),
// but the VALUES inside it are transcript-derived, i.e. ultimately model output over
// third-party speech. In an Electron renderer, dangerouslySetInnerHTML on that is a
// real remote-code path, not a theoretical one. Walking the token stream instead
// costs nothing here: the server emits a small, known subset of markdown.

function Inline({ tokens }: { tokens?: Token[] }): React.ReactNode {
  if (!tokens?.length) return null;
  return tokens.map((t, i) => {
    switch (t.type) {
      case 'strong':
        return <strong key={i}><Inline tokens={(t as Tokens.Strong).tokens} /></strong>;
      case 'em':
        return <em key={i}><Inline tokens={(t as Tokens.Em).tokens} /></em>;
      case 'codespan':
        return <code key={i}>{(t as Tokens.Codespan).text}</code>;
      case 'br':
        return <br key={i} />;
      // Links are deliberately flattened to their text: nothing in a session note
      // should be navigable, and an LLM-authored href is not something to trust.
      case 'link':
        return <Inline key={i} tokens={(t as Tokens.Link).tokens} />;
      case 'del':
        return <del key={i}><Inline tokens={(t as Tokens.Del).tokens} /></del>;
      default: {
        // A 'text' token can itself carry nested inline tokens (bold inside a
        // list item, for instance). Falling back to `raw` there prints the
        // markup verbatim — "**[continue]** Cataplex B" — so recurse first and
        // only use the plain text when there is nothing nested.
        const nested = (t as Tokens.Text).tokens;
        if (nested?.length) return <Inline key={i} tokens={nested} />;
        return <span key={i}>{(t as Tokens.Text).text ?? (t as Token).raw ?? ''}</span>;
      }
    }
  });
}

function Block({ token }: { token: Token }): React.ReactNode {
  switch (token.type) {
    case 'heading': {
      const h = token as Tokens.Heading;
      const Tag = (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'][Math.min(h.depth, 6) - 1] ?? 'h3') as 'h1';
      return <Tag><Inline tokens={h.tokens} /></Tag>;
    }
    case 'paragraph':
      return <p><Inline tokens={(token as Tokens.Paragraph).tokens} /></p>;
    case 'list': {
      const l = token as Tokens.List;
      const items = l.items.map((it, i) => (
        <li key={i}><Inline tokens={it.tokens} /></li>
      ));
      return l.ordered ? <ol>{items}</ol> : <ul>{items}</ul>;
    }
    case 'table': {
      const t = token as Tokens.Table;
      return (
        <table>
          <thead>
            <tr>{t.header.map((c, i) => <th key={i}><Inline tokens={c.tokens} /></th>)}</tr>
          </thead>
          <tbody>
            {t.rows.map((row, r) => (
              <tr key={r}>{row.map((c, i) => <td key={i}><Inline tokens={c.tokens} /></td>)}</tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'blockquote':
      return <blockquote><Markdown source={(token as Tokens.Blockquote).raw} /></blockquote>;
    case 'code':
      return <pre><code>{(token as Tokens.Code).text}</code></pre>;
    case 'hr':
      return <hr />;
    case 'space':
      return null;
    default:
      return null;
  }
}

export function Markdown({ source }: { source: string }) {
  const tokens = marked.lexer(source);
  return (
    <div className="il-prose">
      {tokens.map((t, i) => <Block key={i} token={t} />)}
    </div>
  );
}
