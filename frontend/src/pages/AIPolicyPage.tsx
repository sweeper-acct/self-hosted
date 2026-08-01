import { CONTACT_EMAIL } from '../lib/config'

export default function AIPolicyPage() {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="mx-auto max-w-3xl px-6 py-16">

        {/* Header */}
        <div className="mb-10 border-b pb-6">
          <p className="mb-1 text-sm font-semibold uppercase tracking-widest text-gray-400">Sweeper</p>
          <h1 className="text-3xl font-bold">AI Governance &amp; Responsible Use Policy</h1>
          <p className="mt-2 text-sm text-gray-500">
            Effective date: 30 July 2026 · Part of Sweeper's Terms of Service
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-gray-700">

          {/* 1 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">1. Purpose and scope</h2>
            <p>
              This policy explains how Sweeper uses artificial intelligence technologies within its
              platform, the boundaries of AI capability, and the governance framework that ensures
              human professionals retain control over all accounting outputs.
            </p>
            <p className="mt-2">
              Sweeper provides AI-assisted workflow automation tools designed to support
              appropriately qualified and authorised professionals ("authorised professionals") in
              preparing, reviewing, and certifying BAS/GST workpapers. This policy applies to all
              AI-assisted features provided through the Sweeper platform and to all accounting firms
              ("customers") using those features.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">2. Sweeper's AI approach</h2>
            <p>
              Sweeper uses artificial intelligence as an assistive technology within a controlled
              professional workflow — not as an autonomous decision-maker. AI systems within Sweeper
              may analyse financial documents, identify transaction patterns, suggest GST
              classifications, and generate draft workpapers. Every AI output is produced for human
              review and must be validated, approved, or certified by an authorised professional
              before it advances or is relied upon.
            </p>
            <p className="mt-2">
              Sweeper supports configurable professional review workflows. A typical workflow may include:
            </p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>AI extraction and document analysis</li>
              <li>AI-assisted GST classification and workpaper draft</li>
              <li>Human validation</li>
              <li>Professional review</li>
              <li>Approval and certification where applicable</li>
            </ol>
            <p className="mt-2">
              AI assists at steps 1 and 2 only. All subsequent steps require human action and cannot
              be automated, bypassed, or delegated back to AI.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">3. Permitted AI uses</h2>
            <p className="mb-2">AI within Sweeper may be used to assist with the following:</p>

            <p className="mb-1 font-medium text-gray-800">Document analysis</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li>Extracting transaction details from bank statements.</li>
              <li>Identifying suppliers, payees, dates, and amounts.</li>
              <li>Organising extracted data into structured workpaper format.</li>
            </ul>

            <p className="mb-1 font-medium text-gray-800">GST classification assistance</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li>Suggesting GST treatment based on transaction characteristics.</li>
              <li>
                Applying firm-specific custom coding rules where configured. AI may apply configured
                firm rules but does not independently create or modify professional policies without
                user approval.
              </li>
              <li>Flagging transactions that require authorised professional judgement.</li>
            </ul>

            <p className="mb-1 font-medium text-gray-800">Workpaper generation</p>
            <ul className="list-disc space-y-1 pl-5 mb-3">
              <li>Preparing draft GST workpapers for professional review.</li>
              <li>Generating BAS field calculations from reviewed transaction data.</li>
              <li>Producing explanations and review notes for accountant use.</li>
            </ul>

            <p className="mb-1 font-medium text-gray-800">Workflow support</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Routing tasks to appropriate team members.</li>
              <li>Identifying incomplete or flagged items requiring attention.</li>
              <li>Generating client query links for information requiring clarification.</li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">4. AI limitations</h2>
            <p className="mb-2">Sweeper AI does not and cannot:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Provide accounting, taxation, legal, or professional advice.</li>
              <li>Determine final GST treatment for any transaction.</li>
              <li>Certify, lodge, or submit BAS returns to the ATO or any authority.</li>
              <li>Replace the professional judgement of an authorised professional.</li>
              <li>Make autonomous decisions on behalf of a registered agent.</li>
              <li>Guarantee the accuracy, completeness, or fitness for purpose of any output.</li>
              <li>Access information outside the data explicitly provided by the accounting firm.</li>
              <li>
                Infer unsupported facts, assumptions, or client circumstances not contained in
                available evidence.
              </li>
            </ul>
          </section>

          {/* 5 — NEW */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">5. AI decision boundaries</h2>
            <p>
              Sweeper AI may recommend or assist with workflow activities. It does not and must not
              be used to substitute for professional decision-making.
            </p>
            <p className="mt-2 mb-2">Sweeper AI does not:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Determine the final accounting treatment of transactions.</li>
              <li>Decide whether available evidence is sufficient to support a classification.</li>
              <li>Determine whether a transaction requires further client enquiry or professional escalation.</li>
              <li>Approve professional conclusions or compliance outcomes.</li>
              <li>Certify that any workpaper or BAS return is accurate or complete.</li>
            </ul>
            <p className="mt-2">
              Each of these decisions requires the judgement of an authorised professional and must
              be made by a human acting within their professional responsibilities.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">6. Human review and professional responsibility</h2>
            <p>
              All AI-generated outputs require appropriate human review before being relied upon,
              submitted to any authority, or provided to any client.
            </p>
            <p className="mt-2">
              The accounting firm and its authorised professionals remain responsible for:
            </p>
            <ul className="list-disc space-y-1 pl-5 mt-2">
              <li>Reviewing AI-generated classifications and workpaper drafts.</li>
              <li>Validating GST treatment for each transaction.</li>
              <li>Confirming BAS field calculations and totals.</li>
              <li>Exercising professional judgement on flagged or ambiguous transactions.</li>
              <li>Determining whether a transaction requires further client enquiry or escalation.</li>
              <li>Approving and certifying all BAS-related outputs before lodgement.</li>
              <li>Meeting all obligations as a registered BAS agent, tax agent, or accountant.</li>
            </ul>
            <p className="mt-2">
              Sweeper's workflow enforces human review at every stage. No AI output can advance to
              lodgement without explicit human action. This design is intentional and cannot be disabled.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">7. AI-generated outputs</h2>
            <p>
              AI-generated outputs within Sweeper may include transaction classifications, GST code
              suggestions, confidence indicators, explanations, draft workpapers, BAS field calculations,
              and review recommendations.
            </p>
            <p className="mt-2">
              All AI outputs should be treated as preliminary drafts or recommendations rather than
              final professional conclusions. Outputs may contain errors, omissions, or classifications
              that require correction by an authorised professional.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">8. Confidence indicators</h2>
            <p>
              Sweeper may display confidence indicators alongside AI-generated classifications to help
              accountants prioritise their review. Confidence indicators reflect the system's internal
              assessment of classification reliability based on available transaction data.
            </p>
            <p className="mt-2">
              Confidence indicators are tools for professional guidance only. They are not statistical
              probabilities and should not be interpreted as guaranteed accuracy measurements. A high
              confidence indicator does not reduce or remove the obligation for an authorised
              professional to review a transaction.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">9. AI providers and models</h2>
            <p>
              Sweeper uses third-party AI service providers to deliver AI functionality. Providers are
              selected based on security, reliability, and the availability of appropriate contractual
              protections for customer data. Current providers may include enterprise AI services from
              Anthropic and other providers.
            </p>
            <p className="mt-2">
              AI providers process customer data only to provide services to Sweeper and are subject
              to confidentiality obligations. Where enterprise API terms apply, customer data is not
              used to train publicly available AI models.
            </p>
            <p className="mt-2">
              AI providers may change over time as technology and service requirements evolve. Changes
              to AI providers are managed in accordance with our Privacy Policy and applicable data
              protection obligations.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">10. Data processing and privacy</h2>
            <p>
              Customer data processed through AI features is handled in accordance with Sweeper's
              Privacy Policy. Financial document data transmitted to AI providers is processed only
              for the purpose of generating classifications and workflow outputs.
            </p>
            <p className="mt-2">
              Sweeper applies controls designed to protect confidential financial information during
              AI processing, including data minimisation, access restrictions, and encrypted transmission.
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">11. Model updates and improvements</h2>
            <p>
              AI models used within Sweeper may be updated, replaced, or improved from time to time.
              Changes to underlying AI models may affect output behaviour, classification accuracy, or
              performance characteristics.
            </p>
            <p className="mt-2">
              We endeavour to maintain or improve output quality through model changes. However,
              customers should maintain consistent professional review practices regardless of AI model
              version, as performance may vary across different transaction types and datasets.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">12. Prohibited AI usage</h2>
            <p className="mb-2">Customers must not:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Use Sweeper AI outputs as the sole basis for BAS lodgements or professional decisions without required human review.</li>
              <li>Upload unlawful data or data the firm is not authorised to process.</li>
              <li>
                Attempt to extract, replicate, or reverse-engineer AI models, system prompts,
                internal instructions, classification rules, or proprietary AI configurations.
              </li>
              <li>Represent AI-generated outputs as independently prepared professional advice.</li>
              <li>Circumvent or disable human review stages within the Sweeper workflow.</li>
            </ul>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">13. Auditability and transparency</h2>
            <p>
              Sweeper maintains a tamper-resistant audit trail for all workflow activity. Records may include:
            </p>
            <ul className="list-disc space-y-1 pl-5 mt-2">
              <li>AI-generated outputs and classification basis.</li>
              <li>Human validation and correction actions.</li>
              <li>Reviewer approvals and rejection events.</li>
              <li>Certification actions and timestamps.</li>
              <li>User identity and role for each action.</li>
            </ul>
            <p className="mt-2">
              This audit trail supports professional accountability and provides an evidence record
              of human oversight at every stage of the BAS/GST workflow.
            </p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">14. Relationship with Terms of Service</h2>
            <p>
              This AI Governance &amp; Responsible Use Policy forms part of Sweeper's Terms of Service.
              In the event of any inconsistency between this policy and the Terms of Service, the Terms
              of Service prevail.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">15. Changes to this policy</h2>
            <p>
              We may update this policy from time to time to reflect changes in AI technology, regulatory
              expectations, or service capabilities. Material changes will be notified by email to the
              firm's account owner at least 14 days before taking effect.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="mb-2 text-base font-semibold text-gray-900">16. Contact</h2>
            <p>
              For questions about this policy or Sweeper's use of AI:
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
          Designed to support responsible AI use and professional workflow governance
        </div>

      </div>
    </div>
  )
}
