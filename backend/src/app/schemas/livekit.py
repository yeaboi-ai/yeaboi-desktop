from typing import Literal

from pydantic import BaseModel


class LiveKitTokenResponse(BaseModel):
    token: str
    url: str
    # Participant display name encoded in the token. Returned so the browser-
    # side Deepgram path can post user transcripts under the SAME label the
    # agent worker uses (which reads from LiveKit's participant.name). Without
    # this, the two paths disagree (e.g. NextAuth's Google profile name vs
    # User.name in the DB) and the same utterance shows up under two speakers.
    participant_name: str


class DetachAgentRequest(BaseModel):
    say_goodbye: bool = True


class DetachAgentResponse(BaseModel):
    detached: bool
    method: Literal["noop", "graceful", "forced"]
    removed: list[str]
