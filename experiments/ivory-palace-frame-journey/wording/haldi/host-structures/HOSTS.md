# Haldi hosts and honouree — explicit relationships

Status: Owner-approved editable wording structures. In the fictional example, **Mihika Rajan is the bride** and **Tanish Narayan is the groom**. **Arvind and Meera Rajan are Mihika's parents**. **Rajesh and Kavita Narayan are Tanish's parents**. The **Rajan family** is the bride's family; the **Narayan family** is the groom's family. These are demonstration relationships and must be replaced with client-confirmed data. A family name alone never establishes who is hosting.

## Bride-side Haldi (Mihika)

**Hosts:** Arvind and Meera Rajan, *only if they are hosting*. **Honouree:** their daughter Mihika Rajan. The groom and his parents are not silently added to this event.

> Arvind and Meera Rajan  
> warmly invite you to the Haldi ceremony of their daughter  
> **Mihika Rajan**

If the broader Rajan family hosts instead, do not claim every member is a parent:

> The Rajan family  
> warmly invites you to celebrate the Haldi ceremony of  
> **Mihika Rajan**

## Groom-side Haldi (Tanish)

**Hosts:** Rajesh and Kavita Narayan, *only if they are hosting*. **Honouree:** their son Tanish Narayan. The bride and her parents are not silently added to this event.

> Rajesh and Kavita Narayan  
> warmly invite you to the Haldi ceremony of their son  
> **Tanish Narayan**

If the broader Narayan family hosts:

> The Narayan family  
> warmly invites you to celebrate the Haldi ceremony of  
> **Tanish Narayan**

## Joint Haldi (both partners)

Use only when both are celebrated at the *same event*. Confirm whether both families actually invite guests; a joint honouree does not automatically imply joint hosts.

> The Rajan and Narayan families  
> warmly invite you to the joint Haldi celebration of  
> **Mihika Rajan and Tanish Narayan**

If just the couple hosts:

> Mihika Rajan and Tanish Narayan  
> invite you to celebrate their Haldi ceremony with them.

## Generic editable structures

| ID | Applicable when | Host line | Invitation lead | Separate name line |
| --- | --- | --- | --- | --- |
| HS-01 | Bride's confirmed parents host | `{brideParents}` | `warmly invite you to the Haldi ceremony of their daughter` | `{brideName}` |
| HS-02 | Groom's confirmed parents host | `{groomParents}` | `warmly invite you to the Haldi ceremony of their son` | `{groomName}` |
| HS-03 | Bride's family hosts | `The {brideFamilyName} family` | `warmly invites you to celebrate the Haldi ceremony of` | `{brideName}` |
| HS-04 | Groom's family hosts | `The {groomFamilyName} family` | `warmly invites you to celebrate the Haldi ceremony of` | `{groomName}` |
| HS-05 | Both families host one joint event | `The {brideFamilyName} and {groomFamilyName} families` | `warmly invite you to the joint Haldi celebration of` | `{brideName} and {groomName}` |
| HS-06 | Named hosts; relationship unconfirmed | `{hosts}` | `invite you to the Haldi ceremony celebrating` | `{honoureeName}` |
| HS-07 | Couple hosts their joint event | `{brideName} and {groomName}` | `invite you to celebrate their Haldi ceremony with them` | omit |
| HS-08 | Host names omitted | omit | `Please join us for the Haldi ceremony celebrating` | `{honoureeName}` |
| HS-09 | Extended families host, one honouree | `The {invitingFamilies}` | `warmly invite you to celebrate the Haldi ceremony of` | `{honoureeName}` |
| HS-10 | Named hosts; honouree omitted from this block | `{hosts}` | `warmly invite you to join them for the Haldi ceremony` | omit |

The host line, lead and name line are separate text segments. If a lead ends “of” or “their daughter/son”, the corresponding name is required immediately after it for a complete accessible sentence. Where no name is shown, use HS-07 or HS-10 as a complete sentence. A line ending in “daughter” or “son” is appropriate only for confirmed parents of that person. Never infer honorifics, relationship, gender, marital status or pronouns from names. `hosts` can list one or more people, but singular/plural agreement must be reviewed after names are inserted. Keep complete names even when they wrap on mobile.
