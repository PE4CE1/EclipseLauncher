#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Foundation.Collections.h>
#include <winrt/Windows.Media.Control.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Security.Cryptography.h>
#include <winrt/Windows.Storage.Streams.h>
#include <algorithm>
#include <chrono>
#include <cwctype>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using namespace winrt;
using namespace Windows::Foundation;
using namespace Windows::Media::Control;
using namespace Windows::Data::Json;
using namespace Windows::Security::Cryptography;
using namespace Windows::Storage::Streams;
using Session = GlobalSystemMediaTransportControlsSession;
using Properties = GlobalSystemMediaTransportControlsSessionMediaProperties;

template<class T> auto awaitResult(T const& operation) {
    if (operation.wait_for(std::chrono::seconds(4)) != AsyncStatus::Completed) {
        operation.Cancel();
        throw hresult_canceled();
    }
    return operation.GetResults();
}

std::wstring lower(hstring const& value) {
    std::wstring result(value);
    std::transform(result.begin(), result.end(), result.begin(), [](wchar_t c) { return std::towlower(c); });
    return result;
}

std::wstring sourceKind(Session const& session, Properties const& properties = nullptr) {
    const auto source = lower(session.SourceAppUserModelId());
    if (source.find(L"spotify") != source.npos) return L"spotify";
    for (const auto browser : {L"chrome", L"msedge", L"brave", L"firefox", L"opera"}) {
        if (source.find(browser) != source.npos) {
            if (properties && (lower(properties.Title()).find(L"youtube") != std::wstring::npos || lower(properties.Artist()).find(L"youtube") != std::wstring::npos)) return L"youtube";
            return L"browser";
        }
    }
    return L"other";
}

Session selectSession(GlobalSystemMediaTransportControlsSessionManager const& manager, std::string const& filter, hstring const& target) {
    Session playing{nullptr}, currentCandidate{nullptr}, first{nullptr};
    const auto current = manager.GetCurrentSession();
    for (const auto& session : manager.GetSessions()) {
        try {
            if (!target.empty() && session.SourceAppUserModelId() != target) continue;
            if (filter == "spotify" && sourceKind(session) != L"spotify") continue;
            if (filter == "youtube" && sourceKind(session, awaitResult(session.TryGetMediaPropertiesAsync())) != L"youtube") continue;
            const auto state = session.GetPlaybackInfo().PlaybackStatus();
            if (state == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Closed) continue;
            const bool isCurrent = current && session == current;
            if (isCurrent && state == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) return session;
            if (!playing && state == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing) playing = session;
            if (isCurrent) currentCandidate = session;
            if (!first) first = session;
        } catch (...) { /* A closing player must not hide other usable sessions. */ }
    }
    return playing ? playing : currentCandidate ? currentCandidate : first;
}

hstring artwork(Properties const& media) {
    if (!media.Thumbnail()) return {};
    auto stream = awaitResult(media.Thumbnail().OpenReadAsync());
    const auto length = stream.Size();
    if (!length || length > 393216) return {};
    DataReader reader{stream.GetInputStreamAt(0)};
    const auto size = static_cast<uint32_t>(length);
    if (awaitResult(reader.LoadAsync(size)) != size) return {};
    const auto buffer = reader.ReadBuffer(size);
    const auto bytes = buffer.data();
    const wchar_t* mime = nullptr;
    if (size >= 8 && bytes[0] == 137 && bytes[1] == 80) mime = L"image/png";
    else if (size >= 3 && bytes[0] == 255 && bytes[1] == 216) mime = L"image/jpeg";
    else if (size >= 12 && std::equal(bytes, bytes + 4, "RIFF") && std::equal(bytes + 8, bytes + 12, "WEBP")) mime = L"image/webp";
    else if (size >= 2 && bytes[0] == 66 && bytes[1] == 77) mime = L"image/bmp";
    if (!mime) return {};
    return hstring(std::wstring(L"data:") + mime + L";base64," + std::wstring(CryptographicBuffer::EncodeToBase64String(buffer)));
}

int main() {
    try {
        init_apartment(apartment_type::multi_threaded);
        const auto manager = awaitResult(GlobalSystemMediaTransportControlsSessionManager::RequestAsync());
        std::string coverKey;
        hstring cover;
        auto coverAttempt = std::chrono::steady_clock::time_point::min();
        std::cout << "READY\n" << std::flush;
        std::string line;
        while (std::getline(std::cin, line)) {
            int id = 0;
            JsonObject reply;
            try {
                if (line.size() > 4096) throw hresult_invalid_argument();
                std::istringstream input(line);
                std::string command, filter, encoded, extra;
                if (!(input >> id >> command >> filter >> encoded) || (input >> extra) || id < 1 ||
                    (command != "GET" && command != "TOGGLE" && command != "NEXT" && command != "PREV") ||
                    (filter != "all" && filter != "spotify" && filter != "youtube")) throw hresult_invalid_argument();
                const hstring target = encoded == "-" ? hstring{} : CryptographicBuffer::ConvertBinaryToString(BinaryStringEncoding::Utf8, CryptographicBuffer::DecodeFromBase64String(to_hstring(encoded)));
                if (target.size() > 1000) throw hresult_invalid_argument();
                const auto session = selectSession(manager, filter, target);
                bool success = command == "GET";
                if (session && command != "GET") {
                    const auto info = session.GetPlaybackInfo();
                    const auto controls = info.Controls();
                    if (command == "NEXT" && controls.IsNextEnabled()) success = awaitResult(session.TrySkipNextAsync());
                    else if (command == "PREV" && controls.IsPreviousEnabled()) success = awaitResult(session.TrySkipPreviousAsync());
                    else if (command == "TOGGLE") {
                        if (controls.IsPlayPauseToggleEnabled()) success = awaitResult(session.TryTogglePlayPauseAsync());
                        else if (info.PlaybackStatus() == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing && controls.IsPauseEnabled()) success = awaitResult(session.TryPauseAsync());
                        else if (controls.IsPlayEnabled()) success = awaitResult(session.TryPlayAsync());
                    }
                }
                reply.Insert(L"Success", JsonValue::CreateBooleanValue(success));
                reply.Insert(L"App", JsonValue::CreateNullValue());
                reply.Insert(L"SessionId", JsonValue::CreateStringValue(L""));
                reply.Insert(L"HasCover", JsonValue::CreateBooleanValue(false));
                if (session) {
                    const auto info = session.GetPlaybackInfo();
                    const auto controls = info.Controls();
                    const auto media = awaitResult(session.TryGetMediaPropertiesAsync());
                    reply.Insert(L"App", JsonValue::CreateStringValue(sourceKind(session, media)));
                    reply.Insert(L"SessionId", JsonValue::CreateStringValue(session.SourceAppUserModelId()));
                    reply.Insert(L"Title", JsonValue::CreateStringValue(media.Title()));
                    reply.Insert(L"Artist", JsonValue::CreateStringValue(media.Artist()));
                    reply.Insert(L"Album", JsonValue::CreateStringValue(media.AlbumTitle()));
                    reply.Insert(L"IsPlaying", JsonValue::CreateBooleanValue(info.PlaybackStatus() == GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing));
                    JsonObject capabilities;
                    capabilities.Insert(L"playPause", JsonValue::CreateBooleanValue(controls.IsPlayPauseToggleEnabled() || controls.IsPlayEnabled() || controls.IsPauseEnabled()));
                    capabilities.Insert(L"next", JsonValue::CreateBooleanValue(controls.IsNextEnabled()));
                    capabilities.Insert(L"previous", JsonValue::CreateBooleanValue(controls.IsPreviousEnabled()));
                    reply.Insert(L"Controls", capabilities);
                    const auto key = to_string(session.SourceAppUserModelId()) + '\0' + to_string(media.Artist()) + '\0' + to_string(media.AlbumTitle()) + '\0' + to_string(media.Title());
                    const auto now = std::chrono::steady_clock::now();
                    if (coverKey != key || command != "GET" || (cover.empty() && (coverAttempt == std::chrono::steady_clock::time_point::min() || now - coverAttempt >= std::chrono::seconds(3)))) {
                        coverKey = key; cover = {}; coverAttempt = now;
                        try { cover = artwork(media); } catch (...) {}
                        if (!cover.empty()) reply.Insert(L"Cover", JsonValue::CreateStringValue(cover));
                    }
                    reply.Insert(L"HasCover", JsonValue::CreateBooleanValue(!cover.empty()));
                } else { coverKey.clear(); cover = {}; }
            } catch (...) {
                reply = JsonObject();
                reply.Insert(L"Success", JsonValue::CreateBooleanValue(false));
                reply.Insert(L"Error", JsonValue::CreateStringValue(L"unavailable"));
            }
            reply.Insert(L"Id", JsonValue::CreateNumberValue(id));
            std::cout << "JSON:" << to_string(reply.Stringify()) << '\n' << std::flush;
        }
        return 0;
    } catch (...) { return 1; }
}
