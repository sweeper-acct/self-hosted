import { CONTACT_EMAIL } from '../lib/config'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16">

        {/* Header */}
        <div className="mb-10 border-b pb-6">
          <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-gray-400">Sweeper</p>
          <h1 className="text-3xl font-bold">Privacy Policy</h1>
          <p className="mt-2 text-sm text-gray-500">
            Effective date: 30 July 2026 · Governed by the <em>Privacy Act 1988</em> (Cth)
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          {/* 1 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">1. About Sweeper</h2>
            <p>
              The Sweeper platform is operated by <strong>PIN ME PTY LTD</strong> (ABN&nbsp;94&nbsp;635&nbsp;327&nbsp;365)
              ("we", "us", "Sweeper"). Sweeper is a professional work operating system for Australian
              accounting firms, providing AI-assisted BAS/GST workflow, workpaper management, and audit trail services.
            </p>
            <p className="mt-2">
              This policy explains how we collect, use, store, and disclose personal information in accordance
              with the Australian Privacy Principles (APPs) under the <em>Privacy Act 1988</em> (Cth).
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">2. Information we collect</h2>
            <p className="mb-2">We collect information necessary to provide the service:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Firm and team information</strong> — firm name, ABN, address, team structure and approval chain configuration.</li>
              <li><strong>User account information</strong> — name, email address, role within the firm.</li>
              <li><strong>Client information</strong> — business name, ABN, entity type, address, and director details entered by your firm.</li>
              <li><strong>Financial documents</strong> — bank statements and other files uploaded by your firm for processing.</li>
              <li>
                <strong>Workflow audit records</strong> — user actions, approvals, reviews, certifications,
                and system-generated events recorded in an immutable audit trail.
              </li>
              <li><strong>Billing information</strong> — subscription plan and payment details processed by Stripe on our behalf.</li>
              <li><strong>Usage data</strong> — log files, session data, and error reports used to operate and improve the service.</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">3. Customer data and client information</h2>
            <p>
              Accounting firms that use Sweeper ("customers") remain responsible for the client information
              they provide to the platform and determine the purposes for which that information is processed.
              Accounting firms are responsible for ensuring they have appropriate authority to provide client
              information and to process it using our platform.
            </p>
            <p className="mt-2">
              We generally do not collect personal information directly from your clients. We process
              customer data solely in our capacity as a service provider, in accordance with this policy
              and any applicable service agreement.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">4. How we use your information</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>To provide and operate the Sweeper platform.</li>
              <li>To process financial documents and prepare BAS workpapers using AI-assisted tools.</li>
              <li>To send service notifications (task updates, alerts, SLA reminders) to team members.</li>
              <li>To maintain immutable audit trails to support workflow compliance.</li>
              <li>To process billing and manage subscription accounts.</li>
              <li>To diagnose errors and improve the service.</li>
              <li>To contact you about your subscription or material changes to this policy.</li>
            </ul>
            <p className="mt-2">We do not sell your data or use it for advertising purposes.</p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">5. AI and automated processing</h2>
            <p>
              Sweeper uses third-party artificial intelligence providers to assist with document analysis,
              GST classification, and workflow automation. Financial document data may be transmitted to
              AI service providers solely for the purpose of generating classifications and workflow outputs.
              Current providers may include Anthropic and other enterprise AI providers.
            </p>
            <p className="mt-2">
              We select AI providers that offer appropriate contractual protections regarding customer data
              use and confidentiality. Where enterprise API terms apply, customer data is not used to
              train publicly available AI models.
            </p>
            <p className="mt-2">
              AI-generated classifications, suggestions, and workpapers are preliminary outputs only and
              must be reviewed, verified, and approved by appropriately qualified professionals before
              being relied upon. The final responsibility for professional judgement remains with the
              accounting firm and its authorised personnel. AI outputs do not constitute accounting,
              tax, or legal advice.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">6. Data hosting and security</h2>
            <p>
              Customer data — including financial documents and database records — is hosted using
              infrastructure located in Australia (AWS Sydney, ap-southeast-2 region) through our
              database and storage provider. Application infrastructure may be hosted in other regions
              but does not persist customer financial data. Operational logs may be processed by
              infrastructure providers for security and reliability purposes.
            </p>
            <p className="mt-2">
              We apply the following security controls:
            </p>
            <ul className="list-disc space-y-1 pl-5 mt-2">
              <li>Encryption in transit using TLS for all data transfers.</li>
              <li>Encrypted object storage for financial documents.</li>
              <li>Row-level security policies ensuring each firm's data is isolated from other firms.</li>
              <li>Role-based access control (Partner, Manager, Senior, Junior) enforced at both application and database layers.</li>
              <li>JWT-based authentication with multi-factor verification for new devices.</li>
            </ul>
            <p className="mt-2">
              We take reasonable steps to protect personal information from misuse, interference, loss,
              unauthorised access, modification, or disclosure. However, no system is completely secure
              and we cannot guarantee absolute security.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">7. Third-party service providers</h2>
            <p className="mb-2">We use the following sub-processors to deliver the service:</p>
            <p className="mb-1 font-medium text-gray-800">Data storage and authentication (Australia region):</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li><strong>Supabase</strong> — database, authentication, and file storage hosted in AWS Sydney.</li>
            </ul>
            <p className="mb-1 font-medium text-gray-800">Application infrastructure:</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li><strong>Railway</strong> — application server and worker hosting.</li>
              <li><strong>Redis</strong> — task queue (in-memory only; no persistent customer data stored).</li>
            </ul>
            <p className="mb-1 font-medium text-gray-800">AI processing:</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li><strong>Enterprise AI providers</strong> (currently including Anthropic) — used for GST classification and document analysis; see Section 5.</li>
            </ul>
            <p className="mb-1 font-medium text-gray-800">Payments:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Stripe</strong> — subscription billing and payment processing.</li>
            </ul>
            <p className="mt-3">
              We do not share personal information with third parties for their own marketing or commercial purposes.
            </p>
          </section>

          {/* 8 — NEW */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">8. International data transfers</h2>
            <p>
              While customer financial data and database records are hosted in Australia, some service
              providers used to operate the platform — including AI processing providers, application
              infrastructure, and error monitoring services — may process certain information outside
              Australia.
            </p>
            <p className="mt-2">
              Where personal information is transferred or accessible overseas, we take reasonable steps
              to ensure that appropriate contractual protections and security safeguards are in place,
              consistent with Australian Privacy Principle 8 (APP 8).
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">9. Data retention</h2>
            <p>
              We retain workflow audit records and certified workpapers for periods necessary to support
              our customers' service requirements and compliance needs. Accounting firms remain responsible
              for meeting their own statutory record-keeping obligations, including those under the
              <em> Tax Administration Act 1953</em> and ATO guidelines.
            </p>
            <p className="mt-2">
              User account information is retained for the duration of the subscription and deleted within
              90 days of account closure, unless a longer period is required by applicable law.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">10. Customer data ownership</h2>
            <p>
              You retain ownership of your client information and financial documents uploaded to Sweeper.
              Workpapers and outputs generated by the platform from your data remain your property.
              We do not claim ownership of customer data or client information.
            </p>
            <p className="mt-2">
              Sweeper retains ownership of the platform, software, algorithms, models, and
              system-generated operational metadata. We process customer data solely to provide
              the platform and related services as described in this policy.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">11. Access, correction and export</h2>
            <p>
              Under the Australian Privacy Principles, you have the right to access personal information
              we hold about you and to request corrections if it is inaccurate, out of date, or incomplete.
            </p>
            <p className="mt-2">
              Customers may request export of their data subject to reasonable identity verification and
              technical feasibility. To make an access, correction, or export request, contact us at the
              address in Section 14.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">12. Complaints</h2>
            <p>
              If you believe we have breached the Australian Privacy Principles, please contact us first.
              We will respond within 30 days. If you are not satisfied with our response, you may lodge a
              complaint with the Office of the Australian Information Commissioner (OAIC) at{' '}
              <a href="https://www.oaic.gov.au" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                oaic.gov.au
              </a>.
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">13. Changes to this policy</h2>
            <p>
              We may update this policy from time to time. Material changes will be notified by email to
              the firm's account owner at least 14 days before taking effect. Continued use of the service
              after that date constitutes acceptance of the updated policy.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">14. Contact</h2>
            <p>
              For privacy inquiries, access requests, or complaints:
            </p>
            <p className="mt-2">
              <strong>PIN ME PTY LTD</strong> (operating as Sweeper)<br />
              ABN: 94&nbsp;635&nbsp;327&nbsp;365<br />
              Email:{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-blue-600 underline">{CONTACT_EMAIL}</a>
            </p>
          </section>

        </div>

        <div className="mt-12 border-t pt-6 text-center text-xs text-gray-400">
          © 2026 PIN ME PTY LTD (operating as Sweeper) · ABN 94 635 327 365 ·
          Data hosted in Australia · Designed to support compliance with the <em>Privacy Act 1988</em> (Cth)
        </div>

      </div>
    </div>
  )
}
