import axios from "axios";

export async function sendPostRequest(
    localPort: number,
    prompt: string,
    temperature: number,
    topP: number,
    topK: number,
    repetitionPenalty: number,
    maxLength: number,
) {
    const url = `http://localhost:${localPort}/chat`;
    const data = {
        prompt: escapeSpecialChars(prompt),
        generate_kwargs: {
            temperature: temperature,
            top_p: topP,
            top_k: topK,
            repetition_penalty: repetitionPenalty,
            max_length: maxLength,
        },
    };

    const response = await axios.post(url, data, {
        headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
        },
    });
    return response.data;
}

export function escapeSpecialChars(str: string): string {
    return str
        .replace(/\\/g, "\\\\") // Escape backslashes
        .replace(/"/g, '\\"') // Escape double quotes
        .replace(/'/g, "") // Remove single quotes
        .replace(/\n/g, "\\n") // Escape newlines
        .replace(/\r/g, "\\r") // Escape carriage returns
        .replace(/\t/g, "\\t") // Escape tabs
        .replace(/\f/g, "\\f") // Escape form feeds
        .replace(/`/g, "") // Remove backticks
        .replace(/\0/g, "\\0"); // Escape null characters
}
