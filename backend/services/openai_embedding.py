import os
import httpx
import logging

logger = logging.getLogger("oxengl.ai_embedding")

class OpenAIEmbeddingService:
    """
    OpenAI 1536-Dimensional High-Performance Vector Generation Service.
    Enforces strict mathematical matrix outputs for PostgreSQL pgvector storage.
    """
    def __init__(self):
        # Read the environment variables initialized during server boot configurations
        self.api_key = os.getenv("OPENAI_API_KEY", "")
        self.model = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
        self.api_url = "https://openai.com"
        
        if not self.api_key:
            logger.warning("[AI-EMBEDDING] OPENAI_API_KEY environment variable is blank. Falling back to Mock Vector generation matrix.")

    def get_embedding(self, text_input: str) -> list[float]:
        """
        Translates raw user prompt sentences into a 1536-dimensional float array chunk.
        """
        if not text_input or not isinstance(text_input, str):
            raise ValueError("Input prompt must be a valid, non-empty text string.")
            
        # Fallback to local deterministic mock generation if the network key is missing
        if not self.api_key:
            return self._generate_deterministic_mock_vector(text_input)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "input": text_input.replace("\n", " "),
            "model": self.model
        }

        try:
            # Enforce strict 8-second HTTP networking SLA timeouts
            with httpx.Client(timeout=8.0) as client:
                response = client.post(self.api_url, headers=headers, json=payload)
                
                if response.status_code == 200:
                    data = response.json()
                    embedding_vector = data["data"][0]["embedding"]
                    
                    # Safety alignment check to prevent structural pgvector array allocation overflows
                    if len(embedding_vector) != 1536:
                        raise ValueError(f"Vector footprint mismatch. Expected 1536 dimensions, received {len(embedding_vector)}.")
                    return embedding_vector
                
                logger.error(f"[AI-EMBEDDING] OpenAI connection rejected: HTTP {response.status_code} - {response.text}")
                return self._generate_deterministic_mock_vector(text_input)
                
        except Exception as e:
            logger.error(f"[AI-EMBEDDING] Network connection failure encountered: {str(e)}")
            return self._generate_deterministic_mock_vector(text_input)

    def _generate_deterministic_mock_vector(self, text_input: str) -> list[float]:
        """
        Generates a standardized, stable 1536-dimensional mock vector matrix.
        Guarantees server runtime execution continues even during network isolation.
        """
        # Seed calculation values using input string characters to ensure consistent float distributions
        seed_value = sum(ord(c) for c in text_input) % 100
        base_value = (seed_value + 1) / 1536.0
        
        # Build out a pristine 1536 float block matrix
        mock_vector = [float(base_value + (j * 0.00001)) for j in range(1536)]
        return mock_vector
