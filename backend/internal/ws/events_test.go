package ws

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewEvent(t *testing.T) {
	event, err := NewEvent(EventMessageCreate, map[string]string{
		"content": "hello world",
	})
	require.NoError(t, err)
	assert.Equal(t, EventMessageCreate, event.Type)
	assert.NotNil(t, event.Data)
}

func TestEvent_Serialize(t *testing.T) {
	event, err := NewEvent(EventMessageCreate, map[string]string{
		"content": "test",
	})
	require.NoError(t, err)

	data, err := json.Marshal(event)
	require.NoError(t, err)

	var decoded Event
	require.NoError(t, json.Unmarshal(data, &decoded))
	assert.Equal(t, EventMessageCreate, decoded.Type)
}

func TestEvent_Deserialize(t *testing.T) {
	raw := `{"type":"IDENTIFY","data":{"token":"abc123"}}`

	var event Event
	require.NoError(t, json.Unmarshal([]byte(raw), &event))
	assert.Equal(t, EventIdentify, event.Type)

	var data IdentifyData
	require.NoError(t, json.Unmarshal(event.Data, &data))
	assert.Equal(t, "abc123", data.Token)
}

func TestEvent_NilData(t *testing.T) {
	event, err := NewEvent(EventHeartbeatAck, nil)
	require.NoError(t, err)
	assert.Equal(t, EventHeartbeatAck, event.Type)

	data, err := json.Marshal(event)
	require.NoError(t, err)
	assert.Contains(t, string(data), `"type":"HEARTBEAT_ACK"`)
}
