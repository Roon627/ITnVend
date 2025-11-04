import SlipValidator from '../components/SlipValidator';

export default function ValidateSlip() {
  return (
    <div className="space-y-6 p-4 sm:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-slate-800">Validate Payment Slip</h1>
        <p className="text-sm text-slate-500">
          Upload a bank transfer slip from BML or MIB and confirm it matches the provided transaction reference.
        </p>
      </header>

      <SlipValidator />
    </div>
  );
}
