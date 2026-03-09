import type { PageFixture } from './types.js';

const BRAND_PROFILE = {
  name: 'Boltline',
  industry: 'Hardware engineering & manufacturing',
  audience: 'Hardware engineers, engineering managers, manufacturing teams, CTOs at hardware companies',
  tone: ['professional', 'confident', 'accessible', 'modern'] as string[],
  keywords: [
    'hardware', 'engineering', 'manufacturing', 'design', 'build', 'test',
    'trace', 'improve', 'parts', 'inventory', 'configuration management',
    'workflows', 'supply chain', 'PLM', 'MES',
  ],
};

const HOMEPAGE_FIXTURE: PageFixture = {
  id: 'boltline-homepage',
  difficulty: 'hard',
  title: 'Boltline Homepage',
  pageUrl: 'https://boltline.com/',
  sections: [
    {
      title: 'Hero Headline & Subhead',
      content: 'Hardware, handled — from design to deployment. Boltline is the modern operating system for hardware teams. Manage parts, track inventory, and coordinate manufacturing — all in one place.',
      wordCount: 30,
    },
    {
      title: 'Process Steps - Design',
      content: 'Design. Start with your CAD files and BOMs. Boltline imports your designs and automatically structures your parts library.',
      wordCount: 22,
    },
    {
      title: 'Process Steps - Build',
      content: 'Build. Create work plans, assign tasks, and track production. Every step is logged and traceable.',
      wordCount: 16,
    },
    {
      title: 'Process Steps - Test',
      content: 'Test. Define test protocols, capture results, and link failures back to specific parts and processes.',
      wordCount: 16,
    },
    {
      title: 'Process Steps - Trace',
      content: 'Trace. Full traceability from raw materials to finished goods. Know exactly where every part came from and where it went.',
      wordCount: 22,
    },
    {
      title: 'Process Steps - Improve',
      content: 'Improve. Use data from every stage to optimize your processes. Identify bottlenecks, reduce waste, and ship faster.',
      wordCount: 19,
    },
    {
      title: 'Scalability Pitch',
      content: 'From prototype to production. Whether you are building 10 units or 10,000, Boltline scales with your team. Start small, grow without switching tools.',
      wordCount: 26,
    },
    {
      title: 'Social Proof',
      content: 'Trusted by engineering teams at leading hardware companies.',
      wordCount: 9,
    },
  ],
  objectives: [
    'Clearly communicate what Boltline does in under 5 seconds',
    'Establish Boltline as the modern PLM/MES alternative',
    'Drive visitors to sign up or request a demo',
    'Appeal to both engineers and engineering managers',
    'Differentiate from legacy tools like Arena, Teamcenter, SAP',
  ],
  qualityCriteria: [
    { name: 'Clarity', weight: 30, description: 'Instantly understandable value proposition' },
    { name: 'Conversion', weight: 30, description: 'Drives action — sign up, demo request' },
    { name: 'Brand Voice', weight: 20, description: 'Professional yet accessible, confident not arrogant' },
    { name: 'SEO', weight: 20, description: 'Uses target keywords naturally' },
  ],
  brandProfile: BRAND_PROFILE,
};

const USE_CASES_FIXTURE: PageFixture = {
  id: 'boltline-use-cases',
  difficulty: 'medium',
  title: 'Boltline Use Cases',
  pageUrl: 'https://boltline.com/use-cases/',
  sections: [
    {
      title: 'Page Headline',
      content: 'A unified system for engineering & manufacturing. See how teams across industries use Boltline to coordinate designs, parts, and people.',
      wordCount: 22,
    },
    {
      title: 'Space & Defense',
      content: 'Space & Defense. ITAR-compliant traceability from design through deployment. Manage controlled parts, track serialized components, and maintain audit-ready records for AS9100 and ITAR.',
      wordCount: 28,
    },
    {
      title: 'Medical & Biotech',
      content: 'Medical & Biotech. FDA-ready documentation and device history records. Track parts through design controls, manage DHFs, and maintain 21 CFR Part 11 compliance.',
      wordCount: 25,
    },
    {
      title: 'Advanced Manufacturing',
      content: 'Advanced Manufacturing. Coordinate complex multi-step production across teams and facilities. Real-time visibility into work-in-progress, inventory, and supply chain.',
      wordCount: 23,
    },
    {
      title: 'Alternative Energy',
      content: 'Alternative Energy. Scale from prototype to volume production of solar, battery, and wind components. Track bill of materials evolution and supplier qualifications.',
      wordCount: 24,
    },
    {
      title: 'Universities & Research',
      content: 'Universities & Research. Manage lab equipment, research prototypes, and student projects. Lightweight enough for a lab, powerful enough for a research program.',
      wordCount: 23,
    },
    {
      title: 'General Hardware',
      content: 'General Hardware. For any team building physical products. Consumer electronics, robotics, IoT devices, industrial equipment — Boltline adapts to your workflow.',
      wordCount: 23,
    },
  ],
  objectives: [
    'Show Boltline works across multiple hardware verticals',
    'Demonstrate domain-specific value (compliance, traceability, scale)',
    'Use industry-specific language that resonates with each audience',
    'Drive vertical-specific sign-ups or demo requests',
  ],
  qualityCriteria: [
    { name: 'Industry Relevance', weight: 35, description: 'Uses correct industry terminology and addresses real pain points' },
    { name: 'Specificity', weight: 25, description: 'Mentions specific standards, regulations, workflows' },
    { name: 'Conversion', weight: 20, description: 'Each vertical drives toward next action' },
    { name: 'Conciseness', weight: 20, description: 'Communicates value in minimal words' },
  ],
  brandProfile: BRAND_PROFILE,
};

const PRODUCT_FIXTURE: PageFixture = {
  id: 'boltline-product',
  difficulty: 'hard',
  title: 'Boltline Product Page',
  pageUrl: 'https://boltline.com/product/',
  sections: [
    {
      title: 'Product Headline',
      content: 'The modern way to coordinate designs, parts, and people. Everything your hardware team needs — from first prototype to full production.',
      wordCount: 22,
    },
    {
      title: 'Parts',
      content: 'Parts. Every component in one place. Create, version, and track parts with full revision history. Link parts to drawings, specs, and test results.',
      wordCount: 24,
    },
    {
      title: 'Parts Library',
      content: "Parts Library. Build your team's single source of truth. Searchable, organized, and always up to date. Import from CAD or spreadsheets.",
      wordCount: 22,
    },
    {
      title: 'Inventory',
      content: 'Inventory. Know what you have and where it is. Track stock levels, locations, and lot numbers. Get alerts before you run out.',
      wordCount: 22,
    },
    {
      title: 'Configuration Management',
      content: 'Configuration Management. Control what goes into every build. Define configurations, manage change orders, and ensure the right parts go into the right products.',
      wordCount: 25,
    },
    {
      title: 'Workflows',
      content: 'Workflows. Automate your engineering processes. Route approvals, trigger notifications, and enforce quality gates — without the spreadsheet chaos.',
      wordCount: 20,
    },
    {
      title: 'Work Plans',
      content: 'Work Plans. Define how things get built. Step-by-step manufacturing instructions with parts, tools, and quality checks at each station.',
      wordCount: 21,
    },
    {
      title: 'Supply Chain',
      content: 'Supply Chain. Manage suppliers, track lead times, and qualify sources. Connect your supply chain to your engineering data.',
      wordCount: 19,
    },
  ],
  objectives: [
    'Explain each product capability clearly and concisely',
    'Show how features connect into a unified workflow',
    'Differentiate from legacy PLM tools (Arena, Teamcenter)',
    'Drive feature-specific interest toward sign-up',
    'Appeal to engineers (practical) and managers (strategic)',
  ],
  qualityCriteria: [
    { name: 'Feature Clarity', weight: 30, description: 'Immediately understandable — what it does and why it matters' },
    { name: 'Benefit Focus', weight: 25, description: 'Leads with outcomes, not features' },
    { name: 'Conversion', weight: 25, description: 'Creates desire to try the product' },
    { name: 'Brand Voice', weight: 20, description: 'Consistent Boltline tone — modern, direct' },
  ],
  brandProfile: BRAND_PROFILE,
};

/**
 * Returns deep copies of the 3 Boltline page fixtures.
 */
export function getStaticFixtures(): PageFixture[] {
  return JSON.parse(JSON.stringify([HOMEPAGE_FIXTURE, USE_CASES_FIXTURE, PRODUCT_FIXTURE]));
}
