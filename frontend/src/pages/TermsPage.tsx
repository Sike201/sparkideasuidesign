/**
 * /terms — public Terms of Use page.
 *
 * Required by the Solana dApp Store submission flow (and Google Play if
 * we ever ship there). Kept as a static React page rather than a Notion
 * link so the URL is stable, in-domain, and indexable.
 *
 * Date in the header is sourced from `LAST_UPDATED` so future revisions
 * just need that single string + the changelog block bumped — no need to
 * touch every section.
 */

import { Link } from "react-router-dom"

const LAST_UPDATED = "May 5, 2026"
const CONTACT_EMAIL = "ewan.hamon@gmail.com"

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-[#030303] text-neutral-200 font-satoshi">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-xs text-[#F25C05] hover:underline">
          ← Back to Spark
        </Link>

        <h1 className="text-3xl font-bold text-white mt-6 mb-2">Terms of Use</h1>
        <p className="text-xs text-neutral-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Acceptance">
          <p>
            By accessing or using the Spark application (the "Service",
            available at <Code>justspark.fun</Code> and the Spark mini-app
            on the Solana dApp Store), you agree to be bound by these Terms
            of Use. If you do not agree, do not use the Service.
          </p>
        </Section>

        <Section title="2. What Spark Is">
          <p>
            Spark is a Solana-based launch ecosystem where users can fund,
            build, and trade decision markets attached to hackathons. The
            Service surfaces on-chain markets and lets users interact with
            them through a custodial or self-custody wallet. The Service
            does not custody user funds beyond the optional custodial
            wallets described in Section 4.
          </p>
        </Section>

        <Section title="3. Eligibility">
          <p>
            You must be at least 18 years old and not located in a
            jurisdiction subject to comprehensive sanctions by the United
            States, the European Union, or the United Kingdom (including
            but not limited to Cuba, Iran, North Korea, Syria, and the
            Crimea, Donetsk, and Luhansk regions). You are responsible for
            complying with all laws applicable in your jurisdiction.
          </p>
        </Section>

        <Section title="4. Custodial Wallets">
          <p>
            Spark optionally provisions a custodial Solana wallet for
            users who sign in with Twitter. We hold the private key on
            your behalf solely to sign trade and withdrawal transactions
            you initiate from the app. You may withdraw funds at any time
            to a self-custody wallet. We make commercially reasonable
            efforts to secure custodial keys, but no system is fully
            secure — you accept the residual risk of using a custodial
            wallet by continuing to use the Service.
          </p>
        </Section>

        <Section title="5. Trading Risks">
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li>
              All trades execute on the Solana blockchain and are
              irreversible once confirmed.
            </li>
            <li>
              Decision-market outcomes are determined by on-chain
              time-weighted average price (TWAP). Markets may move
              against you and you may lose all funds you commit.
            </li>
            <li>
              Token prices, including $PREDICT and any IdeaCoin, can be
              highly volatile. Past performance does not guarantee future
              results.
            </li>
            <li>
              Spark is not your financial advisor. Nothing in the Service
              is investment advice, tax advice, or a solicitation to buy
              or sell any asset.
            </li>
          </ul>
        </Section>

        <Section title="6. User Conduct">
          <p>You agree not to:</p>
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li>Use the Service to launder funds or finance illegal activity.</li>
            <li>Attempt to manipulate market prices through wash trading or coordinated trading designed to mislead.</li>
            <li>Reverse-engineer, decompile, or otherwise interfere with the Service's infrastructure.</li>
            <li>Impersonate another person or misrepresent your affiliation with any entity.</li>
            <li>Use bots or automated tooling that materially degrades performance for other users.</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p>
            The Service, its logo, copy, and original visual design are
            owned by Spark or its contributors. The underlying smart
            contracts and on-chain protocols are open source under their
            respective licenses. You retain ownership of any content you
            post (e.g. proposals, comments, tweets you author for
            authentication).
          </p>
        </Section>

        <Section title="8. Disclaimer of Warranties">
          <p>
            The Service is provided "as is" and "as available" without
            warranties of any kind, express or implied, including
            warranties of merchantability, fitness for a particular
            purpose, and non-infringement. We do not warrant that the
            Service will be uninterrupted, error-free, or free of harmful
            components.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            To the fullest extent permitted by law, Spark and its
            contributors shall not be liable for any indirect, incidental,
            special, consequential, or punitive damages, or any loss of
            funds, profits, or data, arising out of or in connection with
            your use of the Service. Our aggregate liability shall not
            exceed the greater of (a) USD 100 or (b) the trading fees you
            have paid through the Service in the prior twelve months.
          </p>
        </Section>

        <Section title="10. Modifications">
          <p>
            We may update these Terms from time to time. Material changes
            will be reflected in the "Last updated" date above. Continued
            use of the Service after a change constitutes acceptance of
            the revised Terms.
          </p>
        </Section>

        <Section title="11. Governing Law">
          <p>
            These Terms are governed by the laws of France, without
            regard to conflict-of-law principles.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions or concerns: <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#F25C05] hover:underline">{CONTACT_EMAIL}</a>.
          </p>
        </Section>
      </div>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-3">{title}</h2>
      <div className="text-sm leading-relaxed text-neutral-300 space-y-3">
        {children}
      </div>
    </section>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="text-[13px] font-mono text-neutral-100 bg-white/5 px-1 py-0.5 rounded">
      {children}
    </code>
  )
}
