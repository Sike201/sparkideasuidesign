// Component to render formatted idea descriptions
// Parses markdown-like format: **Problem:**, **Solution:**, **Target Audience:**

interface DescriptionRendererProps {
  description: string;
}

export function DescriptionRenderer({ description }: DescriptionRendererProps) {
  // Parse the description into sections
  const parseDescription = (desc: string) => {
    const sections: { title: string; content: string }[] = [];
    
    // Match patterns like **Title:** followed by content
    const regex = /\*\*([^*]+):\*\*\s*\n?([^*]+?)(?=\*\*|$)/g;
    let match;
    let lastIndex = 0;
    
    while ((match = regex.exec(desc)) !== null) {
      // Add any content before this section
      if (match.index > lastIndex) {
        const beforeContent = desc.substring(lastIndex, match.index).trim();
        if (beforeContent) {
          sections.push({ title: "", content: beforeContent });
        }
      }
      
      sections.push({
        title: match[1].trim(),
        content: match[2].trim(),
      });
      
      lastIndex = regex.lastIndex;
    }
    
    // Add any remaining content
    if (lastIndex < desc.length) {
      const remaining = desc.substring(lastIndex).trim();
      if (remaining) {
        sections.push({ title: "", content: remaining });
      }
    }
    
    // If no sections found, return the whole description as plain text
    if (sections.length === 0) {
      return [{ title: "", content: desc }];
    }
    
    return sections;
  };

  const sections = parseDescription(description);

  return (
    <div className="prose prose-invert max-w-none">
      <div className="space-y-8 text-[15px] leading-[1.65] text-neutral-300">
        {sections.map((section, index) => (
          <div key={index}>
            {section.title ? (
              <>
                <h3 className="mb-2 font-satoshi text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                  {section.title}
                </h3>
                <div className="whitespace-pre-wrap text-[15px] leading-[1.65] text-neutral-200">
                  {section.content}
                </div>
              </>
            ) : (
              <div className="whitespace-pre-wrap text-[15px] leading-[1.65] text-neutral-200">
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default DescriptionRenderer;
