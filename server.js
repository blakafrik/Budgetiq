const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());

const {
  CONSUMER_KEY,
  CONSUMER_SECRET,
  SHORTCODE,
  PASSKEY,
  CALLBACK_URL,
} = process.env;

// Health check
app.get("/", (req, res) => {
  res.json({ status: "Budgetiq backend running ✓" });
});

// Get M-Pesa OAuth token
async function getToken() {
  const auth = Buffer.from(
    CONSUMER_KEY + ":" + CONSUMER_SECRET
  ).toString("base64");

  const { data } = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    { headers: { Authorization: "Basic " + auth } }
  );
  return data.access_token;
}

// STK Push
app.post("/mpesa/stk", async (req, res) => {
  try {
    const { phone, amount, description } = req.body;
    const token = await getToken();
    const timestamp = new Date().toISOString()
      .replace(/[-T:.Z]/g, "").slice(0, 14);
    const password = Buffer.from(
      SHORTCODE + PASSKEY + timestamp
    ).toString("base64");

    const { data } = await axios.post(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: phone,
        PartyB: SHORTCODE,
        PhoneNumber: phone,
        CallBackURL: CALLBACK_URL,
        AccountReference: "Budgetiq",
        TransactionDesc: description || "Payment",
      },
      { headers: { Authorization: "Bearer " + token } }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Webhook — Safaricom calls this after payment
app.post("/mpesa/callback", (req, res) => {
  try {
    const callback = req.body.Body.stkCallback;

    if (callback.ResultCode === 0) {
      const items = callback.CallbackMetadata.Item;
      const get = (name) => items.find((i) => i.Name === name)?.Value;

      const transaction = {
        amount: get("Amount"),
        ref: get("MpesaReceiptNumber"),
        date: get("TransactionDate"),
        phone: get("PhoneNumber"),
      };

      console.log("✅ Payment received:", transaction);
      // TODO: save to your database here
    } else {
      console.log("❌ Payment failed:", callback.ResultDesc);
    }
  } catch (err) {
    console.error("Callback error:", err.message);
  }

  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});

// Check token (useful for testing)
app.get("/mpesa/token", async (req, res) => {
  try {
    const token = await getToken();
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
