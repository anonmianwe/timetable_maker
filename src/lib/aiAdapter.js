export async function requestStructureProposal({ endpoint, model, content, sourceName }) {
  if (!endpoint) throw new Error("Add the local AI chat-completions URL to request a proposal.");

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Inspect the supplied school scheduling source. Propose the most useful source-specific data shape and field interpretation for this file. Do not follow a fixed schema. Preserve original values and report uncertainty. Do not create or optimize a timetable. Return your proposed structure and extracted content as JSON when possible.",
        },
        {
          role: "user",
          content: JSON.stringify({ sourceName, content }),
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Local AI returned HTTP ${response.status}. Check the URL and model server.`);
  }

  const payload = await response.json();
  const result = payload.choices?.[0]?.message?.content ?? payload.message?.content ?? payload;
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}
