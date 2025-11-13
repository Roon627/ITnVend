import React from "react";
import api from "../../lib/api";

export default function PaymentSettingsPanel({
  formState,
  updateField,
  canEdit,
}) {
  const handleQrCodeFileChange = async (event) => {
    if (!canEdit) return;
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        try {
          const json = await api.post("/settings/upload-qr-code", {
            filename: file.name,
            data: dataUrl,
          });
          const sanitizedUrl =
            typeof json?.url === "string" ? json.url.trim() : "";
          updateField("payment_qr_code_url", sanitizedUrl);
          alert('QR code uploaded successfully!');
        } catch (err) {
          console.error("Upload failed", err);
          alert('Failed to upload QR code. Please try again.');
        }
      };
      reader.onerror = (err) => {
        console.error("Failed to read QR code file", err);
        alert('Failed to read the selected file.');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Unexpected QR code upload error", err);
      alert('An unexpected error occurred during upload.');
    }
  };

  const handleTransferDetailsChange = (e) => {
    updateField("payment_transfer_details", e.target.value);
  };

  const saveTransferDetails = async () => {
    if (!canEdit) return;
    try {
      await api.post("/settings/payment-transfer-details", {
        transfer_details: formState.payment_transfer_details || "",
      });
      alert('Transfer details saved successfully!');
    } catch (err) {
      console.error("Failed to save transfer details", err);
      alert('Failed to save transfer details. Please try again.');
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Bank Transfer Details
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          Enter your bank account details for customers to use when making bank transfers.
          This information will be displayed on invoices and preorder confirmations.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Transfer Details
            </label>
            <textarea
              value={formState.payment_transfer_details || ""}
              onChange={handleTransferDetailsChange}
              disabled={!canEdit}
              placeholder="Bank Name: Bank of Maldives&#10;Account Name: Your Company Name&#10;Account Number: 1234567890&#10;Branch: Male' Branch&#10;Swift Code: MALDMVMF"
              rows={6}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
          {canEdit && (
            <button
              onClick={saveTransferDetails}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              type="button"
            >
              Save Transfer Details
            </button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          QR Code for BML Payments
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          Upload a QR code image for Bank of Maldives (BML) payments. This will be displayed
          to customers who choose QR code as their payment method.
        </p>

        {formState.payment_qr_code_url && (
          <div className="mb-4">
            <p className="text-sm font-medium text-slate-700 mb-2">Current QR Code:</p>
            <div className="inline-block rounded-lg border border-slate-200 p-2">
              <img
                src={`https://pos.itnvend.com${formState.payment_qr_code_url}`}
                alt="Payment QR Code"
                className="h-32 w-32 object-contain"
              />
            </div>
          </div>
        )}

        {canEdit && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Upload New QR Code
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleQrCodeFileChange}
                className="block w-full text-sm text-slate-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="mt-1 text-xs text-slate-500">
                Supported formats: JPEG, PNG, GIF. Maximum size: 5MB.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-6">
        <h3 className="mb-4 text-lg font-semibold text-slate-800">
          Payment Instructions
        </h3>
        <p className="mb-4 text-sm text-slate-600">
          General payment instructions that appear on invoices and receipts.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Instructions
            </label>
            <textarea
              value={formState.payment_instructions || ""}
              onChange={(e) => updateField("payment_instructions", e.target.value)}
              disabled={!canEdit}
              placeholder="Payment is due within 7 days of invoice date. Please include invoice number in payment reference."
              rows={4}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}