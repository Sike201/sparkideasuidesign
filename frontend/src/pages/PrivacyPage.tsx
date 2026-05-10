/**
 * /privacy — public Privacy Policy page.
 *
 * Required by the Solana dApp Store submission flow alongside Terms of
 * Use. Mirrors the structure of `TermsPage.tsx` so updates are obvious
 * — sections are short, scoped to what Spark actually does (Twitter
 * sign-in, custodial wallets, push notifications, on-chain trades),
 * and avoid boilerplate that doesn't apply.
 */

import { Link } from "react-router-dom"

const LAST_UPDATED = "May 5, 2026"
const CONTACT_EMAIL = "ewan.hamon@gmail.com"

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#030303] text-neutral-200 font-satoshi">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link to="/" className="text-xs text-[#F25C05] hover:underline">
          ← Back to Spark
        </Link>

        <h1 className="text-3xl font-bold text-white mt-6 mb-2">Privacy Policy</h1>
        <p className="text-xs text-neutral-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <Section title="1. Overview">
          <p>
            This policy describes what data Spark (the "Service",
            available at <Code>justspark.fun</Code> and via the Spark
            mini-app on the Solana dApp Store) collects, why, and how it
            is stored. We collect the minimum data needed to operate the
            app and never sell user data.
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p>When you use Spark, we may collect:</p>
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li>
              <strong>Twitter identifiers</strong> — your Twitter user
              ID, handle, display name, and public profile image, used to
              authenticate you and display your identity in the app.
              Collected via the public Twitter syndication API after you
              prove ownership of the account by posting a tweet.
            </li>
            <li>
              <strong>Wallet addresses</strong> — the Solana addresses we
              provision for you (custodial public + private wallets), or
              addresses you connect from a self-custody wallet.
            </li>
            <li>
              <strong>On-chain activity</strong> — trade signatures,
              proposal upvotes, deposit and withdrawal transactions, all
              of which are also publicly visible on Solana.
            </li>
            <li>
              <strong>Quiz responses</strong> — the answers you submit
              for the in-app daily quiz, stored against your Twitter ID
              to enforce one-question-per-user-per-day.
            </li>
            <li>
              <strong>Push subscription data</strong> — if you opt into
              browser/mobile notifications, we store the public push
              subscription endpoint provided by your browser. We never
              receive your device's private push key.
            </li>
            <li>
              <strong>Email address</strong> — only when you provide it
              voluntarily (e.g. to participate as an idea investor).
            </li>
            <li>
              <strong>Technical telemetry</strong> — IP address, user
              agent, and timestamps, kept transiently in our hosting
              provider's logs for abuse prevention and debugging.
            </li>
          </ul>
        </Section>

        <Section title="3. How We Use Data">
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li>To authenticate you and serve a personalized app experience.</li>
            <li>To sign trade and withdrawal transactions you initiate (custodial wallet only).</li>
            <li>To send you push notifications you've opted into (e.g. market closing reminders).</li>
            <li>To detect abuse, debug issues, and operate the Service.</li>
            <li>To comply with applicable law.</li>
          </ul>
          <p className="mt-3">
            We do not sell your data, share it with advertisers, or use
            it to train AI models.
          </p>
        </Section>

        <Section title="4. Where Data Is Stored">
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li>
              Application data (profiles, wallets, quiz responses) is
              stored in a Cloudflare D1 SQLite database within
              Cloudflare's infrastructure.
            </li>
            <li>
              Static assets (images, builds) are stored on Cloudflare R2.
            </li>
            <li>
              Solana RPC requests are routed through Helius and equivalent
              providers; on-chain data is, by definition, public.
            </li>
            <li>
              Custodial wallet private keys are encrypted at rest using
              AES-256 with a key managed in our secrets manager. They
              never leave the server.
            </li>
          </ul>
        </Section>

        <Section title="5. Local Storage on Your Device">
          <p>
            Spark uses the browser's localStorage to keep your session
            token, the wallet you've selected (main vs bonus), and a few
            UI preferences (collapsed sections, dismissed quiz prompts).
            This data lives only on your device — clearing it logs you
            out and resets these preferences.
          </p>
        </Section>

        <Section title="6. Sharing With Third Parties">
          <p>
            We share only what is strictly necessary to operate the
            Service:
          </p>
          <ul className="list-disc list-outside space-y-2 ml-5">
            <li><strong>Cloudflare</strong> — hosting and database.</li>
            <li><strong>Helius / Solana RPC</strong> — on-chain reads and writes.</li>
            <li><strong>Twitter (X)</strong> — authentication via the public syndication API.</li>
            <li><strong>Jupiter</strong> — public price feeds and swap routing.</li>
            <li><strong>GeckoTerminal</strong> — public OHLCV chart data.</li>
            <li><strong>Web Push providers</strong> — your browser vendor's push service (Apple, Google, Mozilla) to deliver notifications you've opted into.</li>
          </ul>
          <p className="mt-3">
            Each of these has its own privacy policy. We do not authorize
            any of them to use your data for purposes outside the
            services they perform for us.
          </p>
        </Section>

        <Section title="7. Data Retention">
          <p>
            We retain your data for as long as your account is active.
            On-chain trade history is permanent and cannot be deleted by
            us. Off-chain data (custodial wallet records, quiz responses,
            preferences) can be deleted on request — see Section 9.
          </p>
        </Section>

        <Section title="8. Children">
          <p>
            Spark is not directed to children under 18 and we do not
            knowingly collect data from anyone under 18. If you believe
            we have collected data from a minor, contact us and we will
            delete it.
          </p>
        </Section>

        <Section title="9. Your Rights">
          <p>
            Depending on your jurisdiction (notably the EU/EEA under the
            GDPR), you may have the right to access, correct, export, or
            delete your personal data, and to withdraw consent at any
            time. To exercise these rights, email
            {" "}<a href={`mailto:${CONTACT_EMAIL}`} className="text-[#F25C05] hover:underline">{CONTACT_EMAIL}</a>{" "}
            from the address linked to your account (or include enough
            information for us to verify your Twitter handle).
          </p>
          <p>
            On-chain data is immutable and cannot be erased; deletion
            requests apply only to the off-chain data we control.
          </p>
        </Section>

        <Section title="10. Security">
          <p>
            We use industry-standard encryption in transit (HTTPS) and
            at rest (AES-256 for sensitive fields). No system is fully
            secure; you accept that residual risk by using the Service.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this policy from time to time. Material changes
            will be reflected in the "Last updated" date at the top.
            Continued use of the Service after a change constitutes
            acceptance.
          </p>
        </Section>

        <Section title="12. Contact">
          <p>
            Questions: <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#F25C05] hover:underline">{CONTACT_EMAIL}</a>.
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
