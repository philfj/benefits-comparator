const SYSTEM_PROMPT =
  'You are a benefits document parser. Extract health insurance plan details and return ONLY valid JSON with these exact keys: ' +
  'plan_name, premium_monthly_individual, premium_monthly_family, ' +
  'deductible_individual, deductible_family, ' +
  'oop_max_individual, oop_max_family, ' +
  'coinsurance_pct, copay_primary, copay_specialist, copay_rx_generic. ' +
  'If a field is not found return null. ' +
  'Return ONLY a raw JSON object. No markdown, no code fences, no explanation. Just the JSON.';

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured' });
  }

  const { file_data, media_type } = req.body || {};
  if (!file_data || !media_type) {
    return res.status(400).json({ error: 'Missing required fields: file_data, media_type' });
  }

  let contentBlock;
  if (media_type === 'application/pdf') {
    contentBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: file_data },
    };
  } else {
    contentBlock = {
      type: 'image',
      source: { type: 'base64', media_type, data: file_data },
    };
  }

  let apiResponse;
  try {
    apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              contentBlock,
              { type: 'text', text: 'Extract the health insurance plan details.' },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API', detail: err.message });
  }

  if (!apiResponse.ok) {
    const errText = await apiResponse.text();
    return res.status(502).json({ error: 'Anthropic API error', detail: errText });
  }

  const apiData = await apiResponse.json();
  const text = apiData.content?.[0]?.text || '';

  let parsed;
  try {
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    parsed = JSON.parse(clean);
  } catch {
    return res.status(422).json({ error: 'Could not parse model response as JSON', raw: text });
  }

  return res.status(200).json(parsed);
};
