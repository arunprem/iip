import pytest
from unittest.mock import patch, MagicMock
from iip_llm.client import LLMClient, ChatMessage, LLMResponse

@pytest.fixture
def mock_openai():
    with patch("iip_llm.client.AsyncOpenAI") as MockOpenAI:
        mock_instance = MagicMock()
        mock_response = MagicMock()
        mock_response.choices = [MagicMock()]
        mock_response.choices[0].message.content = "Mocked LLM Response"
        mock_response.model = "llama-3.1"
        mock_response.usage = MagicMock()
        mock_response.usage.prompt_tokens = 10
        mock_response.usage.completion_tokens = 5
        mock_response.usage.total_tokens = 15
        
        # Async mock for chat.completions.create
        async def mock_create(*args, **kwargs):
            return mock_response
            
        mock_instance.chat.completions.create = mock_create
        MockOpenAI.return_value = mock_instance
        yield MockOpenAI

@pytest.mark.asyncio
async def test_llm_client_chat(mock_openai):
    client = LLMClient()
    messages = [ChatMessage(role="user", content="Hello")]
    
    response = await client.chat(messages)
    
    assert isinstance(response, LLMResponse)
    assert response.content == "Mocked LLM Response"
    assert response.total_tokens == 15
