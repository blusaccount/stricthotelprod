# Market data licence inquiry

Template for asking data vendors whether their cheap or free tier covers this
project. Send it to several at once — the answers differ a lot, and a written
"yes" is the only thing worth relying on.

## Who to send it to

| Vendor | Contact | Why them |
| --- | --- | --- |
| EODHD | support@eodhistoricaldata.com | 19.99 EUR/mo "All World", delayed live + EOD, cheapest realistic fit |
| marketstack (apilayer) | via the support form on marketstack.com | from 9.99 USD/mo, 70+ exchanges |
| Twelve Data | support@twelvedata.com | free tier is non-commercial, but they sell a Redistribution Rights add-on — ask what it costs at this scale |
| Databento | sales@databento.com | the only vendor found with explicit external redistribution rights; ask whether a hobby-scale account is viable |
| Tiingo | sales@tiingo.com | redistribution is "on request" — this is the request |

Send individually, not as one thread with everyone in CC.

## What matters in the answer

Get these three in writing. Anything else is detail:

1. **Display to end users.** Nearly every vendor licenses "internal use" by
   default. Showing prices to players is display/redistribution and usually
   needs separate permission. This is the question that decides everything.
2. **Which plan** covers it, and what it costs.
3. **Whether ad-supported pages change the answer.** Some display licences
   distinguish between free and monetised sites.

## The email

> **Subject:** Licence question — delayed quotes in a free browser game (virtual money only)
>
> Hello,
>
> I run a small browser game as a hobby project and I would like to check
> whether one of your plans covers it before I sign up. I would rather ask
> first than build on the wrong assumption.
>
> **What the project is**
>
> A collection of minigames. One of them is a stock market simulator: players
> trade with an in-game virtual currency that has no cash value, cannot be
> bought with real money, and cannot be cashed out. There is no brokerage, no
> real trading, no financial advice, and no recommendations of any kind. The
> prices exist purely so the simulation feels real.
>
> **How the data would be used**
>
> - Displayed to players as the current price of an instrument, plus a simple
>   price chart.
> - Around 50 curated symbols (US and European equities, ETFs, indices,
>   commodities), plus symbols individual players search for.
> - Quotes refreshed server-side roughly every 15 minutes and cached, so all
>   players are served from one cached copy. That is on the order of 2,000
>   API calls per trading day regardless of how many players are online.
> - Delayed data is fine. Real-time is not needed.
> - No redistribution as data: no API of my own, no bulk export, no file
>   downloads. Prices only ever appear as numbers and charts inside the game.
>
> **Scale, honestly**
>
> The site currently has fewer than ten users — friends of mine. I am
> preparing it for a public launch and expect it to stay small. It will be
> free to use and I am considering funding it with display advertising, which
> is why I want the licensing right from the start rather than later.
>
> **My questions**
>
> 1. Does any of your plans allow showing your data to the end users of a
>    public website, or is that a separate display/redistribution licence?
> 2. If it is separate, which plan do I need and what does it cost at this
>    volume?
> 3. Does it make a difference that the site would carry advertising?
> 4. Is there a reduced or free arrangement for hobby and indie projects of
>    this size?
>
> Thanks very much for your time.
>
> Best regards,
> [NAME]
> [SITE URL]
> [EMAIL]

## While you wait

Crypto already runs on CoinGecko, whose API Terms permit commercial use
outright in exchange for the "Powered by CoinGecko" attribution now rendered
on the stocks page. Equities, ETFs, indices and commodities — 48 of the 55
ticker symbols — are still on unlicensed Yahoo endpoints and remain the
blocker for commercial operation.

One thing to raise with CoinGecko separately: their §4.1.7(c) forbids using
their data "in any advertisements or for targeting advertisements". Ads
*beside* the data are most likely a different matter, but the stocks page is
exactly where advertising is planned, so it is worth a written clarification.
