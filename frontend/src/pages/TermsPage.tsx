import { CONTACT_EMAIL } from '../lib/config'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16">

        {/* Header */}
        <div className="mb-10 border-b pb-6">
          <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-gray-400">Sweeper</p>
          <h1 className="text-3xl font-bold">Terms of Service</h1>
          <p className="mt-2 text-sm text-gray-500">
            Effective date: 30 July 2026 · Governing law: Victoria, Australia
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          {/* 1 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">1. Agreement</h2>
            <p>
              By registering for or using Sweeper ("Service"), you ("Firm") agree to these Terms of Service
              ("Terms") on behalf of the accounting firm you represent. If you do not agree, do not use the Service.
              These Terms form a binding agreement between your Firm and PIN ME PTY LTD (ABN&nbsp;94&nbsp;635&nbsp;327&nbsp;365),
              operating as Sweeper ("we", "us").
            </p>
            <p className="mt-2">
              By accepting these Terms, you confirm that you have authority to bind the Firm to this agreement.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">2. Service description</h2>
            <p>
              Sweeper is a professional work operating system for Australian accounting firms. It provides
              AI-assisted workflows for BAS/GST workpaper preparation, including bank statement extraction,
              GST coding, BAS draft generation, and multi-stage human review and certification.
            </p>
            <p className="mt-2">
              Sweeper is a technology tool designed to support qualified accounting professionals in their
              work. It does not replace the professional judgement, review obligations, or statutory
              responsibilities of accountants, BAS agents, tax agents, or other authorised professionals.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">3. AI-assisted processing and professional responsibility</h2>
            <p>
              Sweeper provides technology tools only and does not provide accounting, taxation, legal,
              or professional advice of any kind. AI outputs — including classifications, calculations,
              and workpapers — are preliminary drafts that must be reviewed, verified, and approved
              by appropriately qualified professionals before being relied upon.
            </p>
            <p className="mt-2">
              We do not guarantee that AI-generated outputs will be accurate, complete, or suitable for
              any particular client or circumstance. Your Firm is solely responsible for verifying all
              outputs before certifying or lodging any document with the ATO, any other government
              authority, client, or third party.
            </p>
            <p className="mt-2">
              The final responsibility for professional judgement — including the accuracy and completeness
              of BAS lodgements and workpapers — remains with the accounting firm and its appropriately
              qualified and authorised personnel. You acknowledge that the Service should not be relied
              upon as the sole basis for making professional, financial, taxation, or compliance decisions.
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">4. Accounts and user roles</h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>You must provide accurate firm details during registration.</li>
              <li>You are responsible for all activity that occurs under your Firm's account.</li>
              <li>You must not share login credentials or allow unauthorised access.</li>
              <li>Each user must have their own account; shared accounts are not permitted.</li>
              <li>You must notify us immediately of any suspected unauthorised access.</li>
              <li>
                The Firm is responsible for assigning appropriate user roles (Partner, Manager, Senior,
                Junior) and ensuring each user only accesses information necessary for their role and
                responsibilities within the Firm.
              </li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">5. Your data</h2>
            <p>
              You retain ownership of all data you upload to the Service, including client financial
              documents, uploaded records, and workpapers generated from your data ("Your Data").
              Your Data does not include Sweeper's software, AI models, algorithms, business rules,
              classification logic, workflow designs, templates, or system-generated operational
              metadata, which remain our property.
            </p>
            <p className="mt-2">
              You grant us a limited licence to store, process, and transmit Your Data solely to provide
              the Service. This licence includes processing Your Data through third-party infrastructure
              and AI service providers required to operate the Service. Such providers may process Your
              Data only to provide services to Sweeper and are subject to appropriate confidentiality
              and data protection obligations.
            </p>
            <p className="mt-2">
              You represent that you have the right to upload all data you provide and that doing so
              does not breach any obligation to your clients or any applicable law. You are responsible
              for ensuring appropriate client consent and authority before uploading client financial
              information to the Service.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">6. Acceptable use</h2>
            <p className="mb-2">You must not use the Service to:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Process data you are not authorised to handle.</li>
              <li>Attempt to circumvent security controls or access another firm's data.</li>
              <li>Introduce malware or conduct any attack against the Service or its infrastructure.</li>
              <li>Reproduce or resell the Service without our written consent.</li>
              <li>
                Attempt to reverse engineer, decompile, or extract source code, AI models, classification
                rules, or underlying technology of the Service.
              </li>
              <li>
                Use automated means to access the Service outside permitted functionality or documentation.
              </li>
              <li>Use the Service in a way that violates any applicable law or regulation.</li>
            </ul>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">7. Subscription and payment</h2>
            <p>
              Access to the Service requires a paid subscription. All amounts are quoted in Australian
              dollars unless otherwise stated. Subscription fees are billed in advance on a monthly or
              annual basis as agreed at signup, and are exclusive of GST. GST will be added where applicable.
            </p>
            <p className="mt-2">
              Payments may be processed by third-party payment providers (currently Stripe). You authorise
              such providers to process payment information necessary to complete transactions.
            </p>
            <p className="mt-2">
              Subscriptions renew automatically unless cancelled before the renewal date. No refunds are
              provided for partial subscription periods, except where required by applicable law. We
              reserve the right to suspend access for non-payment after reasonable notice.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">8. Service availability</h2>
            <p>
              We aim to provide a reliable service but do not guarantee uninterrupted availability.
              Planned maintenance will be communicated in advance where practicable. The Service relies
              on third-party providers including cloud infrastructure, database services, and AI providers.
              We are not liable for interruptions or degraded performance caused by those providers —
              including AI model availability, processing limits, or response delays — or by events
              outside our reasonable control.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">9. Confidentiality</h2>
            <p>
              "Confidential Information" includes Your Data, client information, business information,
              non-public information about the Service, and security information disclosed between the parties.
            </p>
            <p className="mt-2">
              We treat Your Data as confidential and will not disclose it to third parties except as
              necessary to operate the Service, as required by law, or with your explicit consent.
              Our employees and contractors who handle Your Data are bound by confidentiality obligations.
            </p>
            <p className="mt-2">
              Confidentiality obligations do not apply to information that: (a) is or becomes publicly
              available through no fault of the receiving party; (b) was already known to the receiving
              party at the time of disclosure; or (c) is independently developed without use of or
              reference to the other party's confidential information.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">10. Intellectual property</h2>
            <p>
              The Service — including all software, AI models, algorithms, business rules, classification
              logic, workflow designs, templates, system methodologies, interfaces, and documentation —
              is owned by PIN ME PTY LTD and protected by intellectual property laws. These Terms do not
              grant you any rights to our intellectual property other than the limited right to use the
              Service as described herein.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">11. Beta features and feedback</h2>
            <p>
              Certain features may be designated as beta or early access. Beta features may contain errors
              or limitations and are provided on an "as available" basis without warranty. Beta features
              may be modified, suspended, or discontinued at any time. We recommend that Firms apply
              additional professional review to outputs generated by beta features before relying on them.
            </p>
            <p className="mt-2">
              You may provide feedback, suggestions, or ideas regarding the Service. You grant us
              permission to use such feedback without restriction or compensation for the purpose of
              improving the Service.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">12. Limitation of liability</h2>
            <p>
              To the maximum extent permitted by Australian law, our liability for any claim arising from
              your use of the Service is limited to the subscription fees paid by you in the three months
              preceding the claim.
            </p>
            <p className="mt-2">
              We are not liable for any indirect, incidental, special, or consequential loss, including
              loss of profit, loss of data, or penalties arising from ATO assessments or any third-party
              claim, even if we have been advised of the possibility of such loss.
            </p>
            <p className="mt-2">
              Nothing in these Terms excludes liability that cannot be excluded under the <em>Australian
              Consumer Law</em> (Schedule 2 of the <em>Competition and Consumer Act 2010</em> (Cth)).
            </p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">13. Termination and Data Retention</h2>
            <p>
              You may cancel your subscription at any time. Upon cancellation, your access continues
              until the end of your current billing period (monthly or annual, as applicable) at no
              additional charge. No refunds are provided for unused time within a paid billing period.
            </p>
            <p className="mt-2">
              After your billing period ends, your organisation data is <strong>archived and preserved</strong> —
              it is not deleted. You may reactivate your subscription at any time to regain full access to
              all archived data. We do not offer a read-only access tier for cancelled accounts.
            </p>
            <p className="mt-2">
              We will retain archived data to support your obligations under applicable record-keeping
              requirements, including the Australian Taxation Office's minimum five-year retention requirement
              for business records. We reserve the right to permanently delete archived data seven years
              after cancellation, with at least 90 days' prior written notice to the Firm's registered email address.
            </p>
            <p className="mt-2">
              We may suspend or terminate your account immediately for material breach of these Terms,
              including non-payment, misuse, activity that places the Service or other users at risk,
              or where continued access may create security, legal, or regulatory risk. In such cases,
              the data retention provisions above apply from the date of termination.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">14. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be notified by email to
              the firm's account owner at least 14 days before taking effect. Continued use of the Service
              after that date constitutes acceptance of the updated Terms.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">15. Governing law</h2>
            <p>
              These Terms are governed by the laws of Victoria, Australia. Any dispute arising under these
              Terms will be subject to the exclusive jurisdiction of the courts of Victoria, including
              without limitation courts exercising jurisdiction in Melbourne, Victoria.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">16. Contact</h2>
            <p>
              For questions about these Terms:
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
          © 2026 PIN ME PTY LTD (operating as Sweeper) · ABN 94 635 327 365 · Governing law: Victoria, Australia
        </div>

      </div>
    </div>
  )
}
