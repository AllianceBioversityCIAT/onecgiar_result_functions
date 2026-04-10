import { ImageResponse } from "next/og";

export const runtime = "edge";

export const alt =
  "PRMS Results API Console — browse and filter PRMS results (GET /result)";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#f6f4ef",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "64px",
          position: "relative",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-80px",
            right: "-80px",
            width: "420px",
            height: "420px",
            background: "rgba(30, 92, 74, 0.12)",
            borderRadius: "50%",
            filter: "blur(80px)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-60px",
            left: "-60px",
            width: "320px",
            height: "320px",
            background: "rgba(30, 92, 74, 0.06)",
            borderRadius: "50%",
            filter: "blur(70px)",
          }}
        />

        <div
          style={{
            fontSize: "26px",
            fontWeight: 600,
            color: "#1e5c4a",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: "20px",
          }}
        >
          CGIAR · PRMS
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: "76px",
              fontWeight: 700,
              color: "#1a1f1c",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
            }}
          >
            Results
          </div>
          <div
            style={{
              fontSize: "76px",
              fontWeight: 700,
              color: "#1e5c4a",
              letterSpacing: "-0.04em",
              lineHeight: 1.05,
              marginLeft: "20px",
            }}
          >
            API Console
          </div>
        </div>

        <div
          style={{
            marginTop: "28px",
            fontSize: "30px",
            fontWeight: 400,
            color: "#5c6560",
            maxWidth: "920px",
            lineHeight: 1.4,
          }}
        >
          Browse and filter results exposed by the fetcher service.
        </div>

        <div
          style={{
            marginTop: "44px",
            padding: "14px 28px",
            background: "rgba(30, 92, 74, 0.1)",
            border: "1px solid rgba(30, 92, 74, 0.28)",
            borderRadius: "100px",
            color: "#1e5c4a",
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          GET /result
        </div>

        <div
          style={{
            position: "absolute",
            bottom: "44px",
            fontSize: "15px",
            color: "#8a9390",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          One CGIAR · Result Functions
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
