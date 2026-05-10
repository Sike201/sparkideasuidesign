import React from 'react';

interface MarkdownRendererProps {
  content: string;
}

/**
 * Simple Markdown renderer for displaying market analysis
 * Handles: headers, bold, italic, lists, tables, code blocks, links
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  // Remove markdown code block wrapper if present
  let processedContent = content.trim();
  if (processedContent.startsWith('```markdown')) {
    processedContent = processedContent.replace(/^```markdown\s*/, '').replace(/\s*```$/, '');
  } else if (processedContent.startsWith('```')) {
    processedContent = processedContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }

  const lines = processedContent.split('\n');
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];

  const processLine = (line: string, index: number) => {
    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        // End code block
        elements.push(
          <pre key={index} className="bg-neutral-900/50 p-3 rounded-lg overflow-x-auto my-3">
            <code className="text-xs text-neutral-300 font-mono">
              {codeBlockContent.join('\n')}
            </code>
          </pre>
        );
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      return;
    }

    // Tables
    if (line.includes('|') && line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      // Skip separator rows (|---|---|)
      if (!line.match(/^\|\s*[-:]+\s*\|/)) {
        tableRows.push(line);
      }
      return;
    } else {
      if (inTable && tableRows.length > 0) {
        // Render table
        const headers = tableRows[0].split('|').map(h => h.trim()).filter(h => h);
        const rows = tableRows.slice(1).map(row => 
          row.split('|').map(cell => cell.trim()).filter(cell => cell)
        );

        elements.push(
          <div key={`table-${index}`} className="overflow-x-auto my-4">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-700">
                  {headers.map((header, i) => (
                    <th key={i} className="px-3 py-2 text-left text-xs font-semibold text-neutral-300">
                      {processInlineMarkdown(header)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={rowIdx} className="border-b border-neutral-800/50">
                    {row.map((cell, cellIdx) => (
                      <td key={cellIdx} className="px-3 py-2 text-xs text-neutral-400">
                        {processInlineMarkdown(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableRows = [];
        inTable = false;
      }
    }

    // Headers
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={index} className="text-xl font-bold text-white mt-6 mb-3">
          {processInlineMarkdown(line.substring(2))}
        </h1>
      );
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(
        <h2 key={index} className="text-lg font-semibold text-white mt-5 mb-2">
          {processInlineMarkdown(line.substring(3))}
        </h2>
      );
      return;
    }
    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={index} className="text-base font-semibold text-white mt-4 mb-2">
          {processInlineMarkdown(line.substring(4))}
        </h3>
      );
      return;
    }

    // Horizontal rule
    if (line.trim() === '---' || line.trim() === '***') {
      elements.push(
        <hr key={index} className="my-4 border-neutral-700" />
      );
      return;
    }

    // Unordered lists
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      const content = line.trim().substring(2);
      elements.push(
        <li key={index} className="ml-4 mb-1 text-sm text-neutral-300 list-disc">
          {processInlineMarkdown(content)}
        </li>
      );
      return;
    }

    // Ordered lists
    if (line.match(/^\d+\.\s/)) {
      const content = line.replace(/^\d+\.\s/, '');
      elements.push(
        <li key={index} className="ml-4 mb-1 text-sm text-neutral-300 list-decimal">
          {processInlineMarkdown(content)}
        </li>
      );
      return;
    }

    // Regular paragraphs
    if (line.trim()) {
      elements.push(
        <p key={index} className="text-sm text-neutral-300 leading-relaxed mb-3">
          {processInlineMarkdown(line)}
        </p>
      );
    } else {
      // Empty line for spacing
      elements.push(<br key={index} />);
    }
  };

  lines.forEach((line, index) => processLine(line, index));

  // Wrap list items in ul/ol
  const wrappedElements: React.ReactNode[] = [];
  let currentList: React.ReactNode[] = [];
  let listType: 'ul' | 'ol' | null = null;

  elements.forEach((element, index) => {
    if (React.isValidElement(element) && element.type === 'li') {
      if (!listType) {
        listType = element.props.className?.includes('list-decimal') ? 'ol' : 'ul';
      }
      currentList.push(element);
    } else {
      if (currentList.length > 0) {
        const ListTag = listType === 'ol' ? 'ol' : 'ul';
        wrappedElements.push(
          React.createElement(ListTag, { key: `list-${index}`, className: 'my-2 space-y-1' }, currentList)
        );
        currentList = [];
        listType = null;
      }
      wrappedElements.push(element);
    }
  });

  if (currentList.length > 0) {
    const ListTag = listType === 'ol' ? 'ol' : 'ul';
    wrappedElements.push(
      React.createElement(ListTag, { key: 'list-final', className: 'my-2 space-y-1' }, currentList)
    );
  }

  return <div className="markdown-content">{wrappedElements}</div>;
}

function processInlineMarkdown(text: string): React.ReactNode {
  // First process all inline markdown (bold, italic, links, code)
  const processed = processOtherInline(text);
  
  // Then process bold separately since it can wrap other elements
  const parts: React.ReactNode[] = [];
  const boldRegex = /\*\*([^*]+)\*\*|__([^_]+)__/g;
  let match;
  let lastIndex = 0;
  let keyCounter = 0;

  while ((match = boldRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      // Process text before bold
      const beforeText = text.substring(lastIndex, match.index);
      if (beforeText) {
        const beforeProcessed = processOtherInline(beforeText);
        if (Array.isArray(beforeProcessed)) {
          parts.push(...beforeProcessed.map((node, i) => 
            React.isValidElement(node) 
              ? React.cloneElement(node, { key: `before-${keyCounter++}-${i}` })
              : <span key={`before-${keyCounter++}-${i}`}>{node}</span>
          ));
        } else {
          parts.push(<span key={`before-${keyCounter++}`}>{beforeProcessed}</span>);
        }
      }
    }
    parts.push(<strong key={`bold-${keyCounter++}`} className="font-semibold text-white">{match[1] || match[2]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const afterText = text.substring(lastIndex);
    if (afterText) {
      const afterProcessed = processOtherInline(afterText);
      if (Array.isArray(afterProcessed)) {
        parts.push(...afterProcessed.map((node, i) => 
          React.isValidElement(node) 
            ? React.cloneElement(node, { key: `after-${keyCounter++}-${i}` })
            : <span key={`after-${keyCounter++}-${i}`}>{node}</span>
        ));
      } else {
        parts.push(<span key={`after-${keyCounter++}`}>{afterProcessed}</span>);
      }
    }
  }

  // If no bold found, just use the processed inline
  if (parts.length === 0) {
    return Array.isArray(processed) ? <>{processed}</> : processed;
  }

  return parts.length > 0 ? <>{parts}</> : text;
}

function processOtherInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let processed = text;

  // Links [text](url)
  processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    const index = processed.indexOf(match);
    parts.push(
      <a
        key={`link-${index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-400 hover:text-blue-300 underline"
      >
        {linkText}
      </a>
    );
    return `__LINK_PLACEHOLDER_${parts.length - 1}__`;
  });

  // Italic (*text* or _text_)
  processed = processed.replace(/\*([^*]+)\*|_([^_]+)_/g, (match, text1, text2) => {
    const index = processed.indexOf(match);
    parts.push(
      <em key={`italic-${index}`} className="italic text-neutral-200">
        {text1 || text2}
      </em>
    );
    return `__ITALIC_PLACEHOLDER_${parts.length - 1}__`;
  });

  // Code inline `code`
  processed = processed.replace(/`([^`]+)`/g, (match, code) => {
    const index = processed.indexOf(match);
    parts.push(
      <code key={`code-${index}`} className="bg-neutral-900/50 px-1.5 py-0.5 rounded text-xs font-mono text-neutral-200">
        {code}
      </code>
    );
    return `__CODE_PLACEHOLDER_${parts.length - 1}__`;
  });

  // Split by placeholders and add text parts
  const segments = processed.split(/(__\w+_PLACEHOLDER_\d+__)/);
  const result: React.ReactNode[] = [];

  segments.forEach((segment, i) => {
    const placeholderMatch = segment.match(/__(\w+)_PLACEHOLDER_(\d+)__/);
    if (placeholderMatch) {
      const placeholderIndex = parseInt(placeholderMatch[2]);
      if (parts[placeholderIndex]) {
        result.push(parts[placeholderIndex]);
      }
    } else if (segment) {
      result.push(segment);
    }
  });

  return result.length > 0 ? result : [text];
}
