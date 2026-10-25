---
title: Shrink your data into bitfields (and out again)
slug: shrink-your-data-into-bitfields-and-out-again
alias: blog/shrink-your-data-into-bitfields
published_date: 2020-04-29T04:00:00+00:00
tags: data, elixir, programming
publish: true
meta_description: Some applications want to save every byte. Every last byte! Learn how bitfields allow us to shink complex data down into a bitfield.
---

Some applications want to save every byte. Every last byte! Maybe they have memory constraints, maybe they're sending data over the network, maybe they just like saving bytes.

One way to help save bytes is to use efficient data structures. One popular memory efficient data structure is a bitfield. A bitfield allows complex, predefined data to be stored in a compact series of bits.

We'll take some data from this:

```json
{
  "priority": "urgent",
  "location": "Room 71",
  "status": "empty",
  "candy": "peppermint patties"
}
```

To this! The same data!

```json
1110001111000
```

(That base-2 number is `7288` in base-10).

We'll do that in a series of steps and using less data with each one.

<bitfield-steps>

## Step 1, the original data

```json
{
  "priority": "urgent",
  "location": "Room 71",
  "status": "empty",
  "candy": "peppermint patties"
}
```

## Step 2, drop the keys

```json
["urgent", "Room 71", "empty", "peppermint patties"]
```

## Step 3, reduce the values

```json
[3, 71, 1, 0]
```

## Step 4, merge those values into a single number

In base-10

```elixir
7288
```

In base-2

```elixir
1110001111000
```

</bitfield-steps>

How? Incrementally!

# Starting with the data

Let's say we have some data

| field    | value              |
| :------- | :----------------- |
| priority | urgent             |
| location | Room 71            |
| status   | empty              |
| candy    | peppermint patties |

That's some good data. Now let's say we need to represent that data in code. A hash should do nicely.

```elixir
data = %{
  "candy" => "peppermint patties",
  "location" => "Room 71",
  "priority" => "urgent",
  "status" => "empty"
}
```

That's some nice data! But if we serialize it to JSON we have 88 bytes!

```elixir
data
|> Jason.encode!()
|> byte_size()
# => 88
```

What can we do to use less bytes?

# Give up the keys

If we agree on the keys ahead of time we can stop sending those around. That means we need to fix the data into an order and coordinate that among all systems using that data. If we're ok with that then that's big step!

```elixir
smaller_data = [
  "urgent",
  "Room 71",
  "empty",
  "peppermint patties",
]

smaller_data
|> Jason.encode!()
|> byte_size()
# => 49
```

Wooo, 49 bytes! We've already gotten it down to 55% of the original size. We gave up some flexibility because we now we have a fixed set of keys in a fixed order but we saved a lot of space!

We can go even further if we're willing to give up still more flexibility.

# Limit the possible values

If we can give up having arbitrary values then we can much more efficently represent those values.

Take the "candy" for example. Right now it could be any string, any string at all!

| Candy              | Bytes to represent |
| ------------------ | -----------------: |
| peppermint patties |                 18 |
| m&ms               |                  4 |
| reese's pieces     |                 14 |
| butterfingers      |                 13 |
| cookies            |                  7 |

But if we know we have a limited set of possible candies then we don't need the ability to have any string. For example, if we have ten or fewer possible candies we can use a single digit to represent them all.

| Candy              | Number | Bytes |
| ------------------ | :----: | ----: |
| peppermint patties |   0    |     1 |
| m&ms               |   1    |     1 |
| reese's pieces     |   2    |     1 |
| butterfingers      |   3    |     1 |
| cookies            |   4    |     1 |

That means we if replace "peppermint patties" in our data with `0` (our arbitrary agreed upon value to represent that candy) then we can cut our byte usage down a bit.

```elixir
even_smaller_data = [
  "urgent",
  "Room 71",
  "empty",
  0
]

even_smaller_data
|> Jason.encode!()
|> byte_size
# => 30
```

Now we're down to 34% of the original size with that optimization alone!

Let's squish down the other data by limiting their options.

```elixir
priority = ~w(low medium high urgent)

location = 1..100 # i.e. Room 1 to Room 100

status = ["not empty", "empty"]

candy = [
  "peppermint patties",
  "m&ms",
  "reese's pieces",
  "butterfingers",
  "cookies"
]
```

With those contraints our original data becomes much smaller still. Priority can be the value `3` (urgent), location can be `71` (room 71), status can be `1` (empty), and candy can be `0` (peppermint patties).

```elixir
even_smaller_still_data = [3, 71, 1, 0]

even_smaller_still_data
|> Jason.encode!()
|> byte_size()
# => 10
```

10 bytes! We're down to around 11% of the size of the original data!

At this point we could use some code that has explicit knowledge of the data structure to serialize the data down and parse it back out.

```elixir
defmodule CandyData do
  @priority ~w(low medium high urgent)
  @location 1..100
  @status ["not empty", "empty"]
  @candy [
    "peppermint patties",
    "m&ms",
    "reese's pieces",
    "butterfingers",
    "cookies"
  ]

  def serialize(data) do
    [
      priority(data),
      location(data),
      status(data),
      candy(data)
    ]
  end

  def deserialize([priority, location, status, candy]) do
    room =
      if location in @location do
        "Room #{location}"
      else
        nil
      end

    %{
      "priority" => Enum.at(@priority, priority),
      "location" => room,
      "status" => Enum.at(@status, status),
      "candy" => Enum.at(@candy, candy)
    }
  end

  defp priority(%{"priority" => priority}) do
    Enum.find_index(@priority, &(&1 == priority))
  end

  defp location(%{"location" => "Room " <> room}) do
    room = String.to_integer(room)

    if room in @location do
      room
    else
      :error
    end
  end

  defp status(%{"status" => status}) do
    Enum.find_index(@status, &(&1 == status))
  end

  defp candy(%{"candy" => candy}) do
    Enum.find_index(@candy, &(&1 == candy))
  end
end
```

```elixir
data = %{
  "candy" => "peppermint patties",
  "location" => "Room 71",
  "priority" => "urgent",
  "status" => "empty"
}

data
|> CandyData.serialize() #=> [3, 71, 1, 0]
|> CandyData.deserialize() #=> %{
#=>   "candy" => "peppermint patties",
#=>   "location" => "Room 71",
#=>   "priority" => "urgent",
#=>   "status" => "empty"
#=> }
```

```elixir
other_data = %{
  "priority"=>"low",
  "location"=>"Room 23",
  "status"=>"not empty",
  "candy"=>"m&ms"
}

other_data
|> CandyData.serialize() #=> [0, 23, 0, 1]
|> CandyData.deserialize() #=> %{
#=>   "candy" => "m&ms",
#=>   "location" => "Room 23",
#=>   "priority" => "low",
#=>   "status" => "not empty"
#=> }
```

That's pretty efficient, but since we're already paying the cost to have custom code for serializing and parsing the data we can go even further! Our data _still_ has some lurking flexibility that we could trade for a decrease in size. The data values themselves!

# Push all the values into a bitfield

Consider that `status` field. We know it can only have two possible values: empty or not empty. But we're using a data value that could hold many many more numbers than that fixed set of two options.

If we _know_ there can be only two then we can limit ourselves to only using 0 or 1 and then we have information that could be stored entirely in a single bit. But how can we store the priorities or all the types of candy or all the possible room locations as bits?

The answer is to use the fewest number of bits that can hold the range of possible options.

Let's illuminate that with the "priority" field. The priority field has four options.

| Priorities |
| ---------- |
| low        |
| medium     |
| high       |
| urgent     |

We can't represent those options with a single 0 or 1 bit. But we can represent them all with TWO bits.

| Priority | Integer | Bits |
| -------- | ------: | ---: |
| low      |       0 |   00 |
| medium   |       1 |   01 |
| high     |       2 |   10 |
| urgent   |       3 |   11 |

It's the same data, but restricted down to the absolutely smallest and least flexible space.

The number of bits you need for a field is enough to represent the power of two large enough to count all the values.

Let's say we want a bitfield to hold days of the month. There are 31 possible values from 1 to 31. Let's see how many bits we'd need to hold that data.

| Number of Bits | Available Values |   Range |
| :------------- | :--------------: | ------: |
| 1              |        2         |   0...1 |
| 2              |        4         |   0...3 |
| 3              |        8         |   0...7 |
| 4              |        16        |  0...15 |
| 5              |        32        |  0...31 |
| 6              |        64        |  0...63 |
| 7              |       128        | 0...127 |
| 8              |       256        | 0...255 |

Hey there we go! Using 5 bits gives us a bucket of 32 spaces which is just a little more than we need to hold any of the 31 possible days in a month.

Let's take a look at the bits the rest of our data fields would require.

| Data Field | Possible Values | Bits Required |
| ---------- | --------------: | ------------: |
| priority   |               4 |             2 |
| location   |             100 |             7 |
| status     |               2 |             1 |
| candy      |               5 |             3 |

Great! What would it look like to represent our sample data in these bits?

Let's start off simply representing each value as a base-2 string.

```elixir
data
|> CandyData.serialize()               #=> [3, 71, 1, 0]
|> Enum.map(&Integer.to_string(&1, 2)) #=> ["11", "1000111", "1", "0"]
```

Right now you may be thinking how is turning base-10 numbers into base-2 strings any help? Serializing something like "10" to JSON would be twice the data needed to serialize the single digit `2`. How can that be a savings?"

You are right on! If we were to represent our bits with one digit per bit in JSON that would be much too large! Instead we'll push all of our data together into a bitfield integer and represent _that_ as JSON.

Currently we've gotten our data to an array of base-2 number strings instead of array of base-10 numbers. So yeah that's not a size reduction! Not at all!

```elixir
json_base10_numbers #=> "[3,71,1,0]"
|> byte_size()      #=> 10

json_base2_strings  #=> "[\"11\",\"1000111\",\"1\",\"0\"]"
|> byte_size()      #=> 24
```

How is this going to save us any space? We're gonna squish those bits! Instead of keeping all of those bits apart we'll push them right next to each other and treat _that_ resulting value as a single number.

Ultimately for this specific example we want to get this binary number:

```elixir
0b1110001111000
```

Made up of these components

| Priority | Location | Status | Candy |
| :------- | :------: | :----: | ----: |
| 11       | 1000111  |   1    |   000 |

Would that save us space? Absolutely! Because we can represent that base-2 string of bits as an integer of whatever base we like!

```elixir
bitfield = 0b1110001111000

[2, 8, 10, 12, 16]
|> Enum.each(fn base ->
  representation = Integer.to_string(bitfield, base)

  case base do
    digit when digit < 10 ->
      IO.puts("Base #{base}:  #{representation}")

    _other ->
      IO.puts("Base #{base}: #{representation}")
  end
end)
```

```
Base 2:  1110001111000
Base 8:  16170
Base 10: 7288
Base 12: 4274
Base 16: 1C78
```

Sticking with base-10 for simplicity and all of our original data would be represented as 7288. That's just 4 bytes as JSON! 4.5% of the original 88 bytes!

# Constructing a bitfield

It might seem like we could simply take our individual integer values we've derived, convert them each to base-2, and then join them together into a string that will be our base-2 bitfield.

As a quick review we've gotten our data values into base-10 integers:

```elixir
data = %{
  "candy" => "peppermint patties",
  "location" => "Room 71",
  "priority" => "urgent",
  "status" => "empty"
}

CandyData.serialize(data) #=> [3, 71, 1, 0]
```

Let's convert them individually to base-2

| Field    | Base-10 |  Base-2 |
| -------- | ------: | ------: |
| Priority |       3 |      11 |
| Location |      71 | 1000111 |
| Status   |       1 |       1 |
| Candy    |       0 |       0 |

Here you might spot the problem with a simple conversion of each integer to base-2 and joining them into a string. But if not don't worry! You're in good company because the problem is neither obvious nor intuitive.

Check out that last `0`. Our candy field is _supposed_ to have three bits of data. It's only shown as a single `0` in our results so far because `0b0` is the same as `0b00` and `0b000` just like `000` is `00` and `0`: they're all simply zero! That was fine when our bits were separated into an array, but it's not going to work at all when our bits are all going to be part of the same number.

Let's see that problem directly:

```elixir
["11", "1000111", "1", "0"]
|> Enum.join()          #=> "11100011110"
|> String.to_integer(2) #=> 1822

["11", "1000111", "1", "000"]
|> Enum.join()          #=> "1110001111000"
|> String.to_integer(2) #=> 7288
```

7288 is NOT 1822! Let's compare what happens when we convert those back to base-2

```elixir
Integer.to_string(1822, 2) #=> "11100011110"
Integer.to_string(7288, 2) #=> "1110001111000"
```

That difference might look like no big deal, but it's literally just like the difference between the number 23 and the number 2300. Those zeros on the right are very important!

Could we solve the problem by simply padding our number to 13 bits? It might seem that way.

```elixir
1822                            #=> 1822
|> Integer.to_string(2)         #=> "11100011110"
|> String.pad_trailing(13, "0") #=> "1110001111000"
|> String.to_integer(2)         #=> 7288

7288                            #=> 7288
|> Integer.to_string(2)         #=> "1110001111000"
|> String.pad_trailing(13, "0") #=> "1110001111000"
|> String.to_integer(2)         #=> 7288
```

But no, we can't simply solve the issue by padding the entire string. Padding the number with zeros only works in this case because the `0` value happens in the last field. If the `0` were in a multi-bit field in the middle of the bitfield then no amount of left or right padding would fix the problem.

We _could_ pad each individual integer to its known bit length and then join the results into a string that we could convert into base-2. But that would be hacking our way around the problem.

Instead of hacking our way through with padded zeros we will properly construct our bitfield. That means putting in a little more thought than simply converting each individual field to base-2 and joining them.

Fair warning, I'm going to ramble around the following explanations in various ways. If you feel like you've got it, skim along. If you don't then hopefully one of the explanations helps get you there.

# What is a bitfield?

A bitfield is, ultimately, a number. It's not special, not magical. We make it special by assigning significance to specific divisors that make up the number. In a bitfield's case we assign significance to the powers of 2 that make up the number.

Why powers of 2? Because that's what computers are good at. Every bit is either 0 or 1. A bit is the smallest component of memory we can manipulate. If we want our data to be as small as possible that means using the smallest number of bits that can represent the individual pieces of data we want to reference.

Since we want to represent more data than a single bit can hold and since we want to keep all of our data together to make it as small as possible that means we have to place all of our bits into a single number. That means every single bit and its position in the number is very important. As a series of numbers 101110 might look similar to 1011100 but, like we've seen, it is quite literally the difference between 46 and 92.

The key is that the "pieces" (digits) of our bitfield number in binary are the data we want to store. What the pieces represent and their size is entirely arbitrary. The same bitfield `1100` might be one field, two fields, three fields, or four fields.

```
    1100 = 1 field with 16 possible values
   11 00 = 2 fields with 4 possible values each
   1 100 = 2 fields: one with 2 possible values and one with 8 possible values
   110 0 = 2 fields: one with 8 possible values and one with 2 possible values
  1 1 00 = 3 fields: two with 2 possible values and one with 4 possible values
  1 10 0 = 3 fields: two with 2 possible values and one with 4 possible values
  11 0 0 = 3 fields: two with 2 possible values and one with 4 possible values
 1 1 0 0 = 4 fields with 2 possible values each
```

<bitfield-explorer>
</bitfield-explorer>

[Explore more bitfield representations](https://curious.strangeleaflet.com/bitfield-explorer/) in the Cabinet of Curios.

As a quick level set on number "places" in base-10 vs base-2 let's look at what the number `1000` represents in base-2 vs base-10.

| Number | 1 | 0 | 0 | 0 |
| --- | --- | --- | --- | --- |
| Base-10 Place | 1000 | 100 | 10 | 1 |
| Base-2 Place | 8 | 4 | 2 | 1 |

In other words, each new digit represents another power of the base.

| N   |  10^N | 2^N |
| :-- | ----: | --: |
| 0   |     1 |   1 |
| 1   |    10 |   2 |
| 2   |   100 |   4 |
| 3   |  1000 |   8 |
| 4   | 10000 |  16 |
| ... |   ... | ... |

As we add data to our bitfield we'll be adding more and more powers of base-2.

| bitfield length | possible values in base-10 |
| --------------: | -------------------------: |
|               1 |                      0...1 |
|               2 |                      0...3 |
|               3 |                      0...7 |
|               4 |                     0...15 |

<bitfield-length>
</bitfield-length>

# Constructing a bitfield by hand

Ok, so let's construct OUR bitfield. Smallest to largest:

| Field    | Bits |
| :------- | ---: |
| candy    |    3 |
| status   |    1 |
| location |    7 |
| priority |    2 |

More verbosely our fields will take up these powers of two (from smallest to largest)

| Field    | Power of 2 | Value |
| :------- | ---------: | ----: |
| candy    |          0 |     0 |
| candy    |          1 |     2 |
| candy    |          2 |     4 |
| status   |          3 |     8 |
| location |          4 |    16 |
| location |          5 |    32 |
| location |          6 |    32 |
| location |          7 |    64 |
| location |          8 |   128 |
| location |          9 |   256 |
| location |         10 |   512 |
| location |         11 |  1024 |
| priority |         12 |  2048 |
| priority |         13 |  4096 |

We have four fields: priority, location, status, candy. We know the number of bits we need for each and we know the order in which we want to place them. Using that information we can figure out how to turn each of our field values into their respective parts of the bitfield.

To convert each value to its part of our bitfield number we need to determine what units of two it represents. That is: what's the smallest "place" of its part of the bitfield? It's a weird concept to explain so let's do it instead and then circle back to try and put it all together.

We'll build our bitfield from smallest to largest numbers. That is we'll create it right to left: starting with the smallest number places of the bitfield and finishing with the largest number places.

First we have candy. Since it's the first field its unit is 1. But our value (`peppermint patties`) is represented as 0 so we end up with a value of 0 going into the bitfield. It's three bits of zero, but that's not information we can encode in the zero itself.

```
0 * 1 = 0
```

Next we have status. Our value (`empty`) is represented as 1 in our design. BUT since candy takes three bits to hold its data our status value of 1 needs to use 8 for its units. The 0s, 2s, and 4s places are all reserved for candy data.

```
1 * 8 = 8
```

After status is location. Our value (`Room 71`) will be represented as `71` in our data. But instead of being that value `71` directly it will be `71` **times** the power of 2 where its field belongs. That means all of the location data will be in units of 16.

```
71 * 16 = 1136
```

Last we have priority. Our value (`urgent`) will be represented as the value `3`. Since location took a whopping seven bits of data priority is pushed way up into units of 2048.

```
3 * 2048 = 6144
```

Adding those all up and we get our bitfield value. If we've done things right then they should all add up to `7288` which we've already determined to be the correct value.

```
0 + 8 + 1136 + 6144 = 7288
```

Success! But let's double check by working backwards.

```elixir
7288
|> Integer.to_string(2)
|> then(&(Regex.scan(~r/^(..)(.......)(.)(...)$/, &1) |> List.first()))
|> then(fn [_all | rest] -> rest end)
#=> ["11", "1000111", "1", "000"]
```

Let's break that down once again, smallest to largest (candy, status, location, priority)

- `000` for candy
- `1` for status
- `1000111` for location
- `11` for priority

In base-10 (and separated out of the bitfield) they're respectively the values `3`, `71`, `1`, and `0`. That checks out! (Don't worry we'll parse bitfields for real later on.)

# Constructing a bitfield by adding powers of two

That worked, but we need a generalized programmable solution to putting our data into a bitfield. We need an algorithm! The result of our calculation should be the base-10 integer number `7288`.

Our algorithm will need three pieces of data to calculate the resulting integer:

- The bit lengths of each field
- The order of the fields
- The values to store in each field

The process:

Calculate the unit power of two for each field based on its bit length. The unit power is the smallest power of two that can represent the field.

Candy, the first field, starts things off with a unit power of `0` and a value of `0` which results in `0`. Candy will take three bits to hold its range of data so we have to reserve the first three powers of two for that data: `0, 1, 2`.

```
2^0 * 0 = 0
```

Next is the status field. Since the candy field took three bits status will be represented via the next power of two: `2^3 = 8`. Status only needs one bit so that's the only power of two it will claim. Its value is `1` so we just need to multiply that by its unit power of two.

```
2^8 * 1 = 8
```

Location will be represented the very next power of two: `2^4 = 16`. Location data needs to claim seven bits of data so it will take up these powers of two: `4, 5, 6, 7, 8, 9, 10`. Our location's value is `71`.

```
2^4 * 71 = 1136
```

Finally the priority field coming in after those seven bits claimed for location will be in units of `2^11` which is `2048`. Our priority value is `3`

```
2^{11} * 3 = 6144
```

Given a set of field values, their order, and their bit lengths we could arbitrarily map that data into the bit unit for each field. Great! That means we can construct that data in advance and it's a simple matter of multiplication and addition to arrive at our bitfield integer.

The process would be:

1. Precalculate the base-2 units for each field
2. Receive incoming data to place into the bitfield
3. Map each data value to its integer representation
4. Multiply each of those values by its field's base-2 unit
5. Add all of those calculated values to arrive at the bitfield integer

SIDE NOTE: Instead we could use BITWISE LEFT SHIFT instead multiplying and adding the values. That operation "pushes" new values into the bitfield. We'll see how to do that later in the post.

Here's a code example of a generic bitfield generator that has no existing hardcoded knowledge of our fields.

```elixir
defmodule Bitfield do
  defstruct fields: [], exponent: 0

  defmodule Field do
    defstruct [:name, :length, :units]
  end

  def new() do
    %__MODULE__{}
  end

  def add_field(%__MODULE__{} = bitfield, name, bits) do
    bitfield
    |> update_in(
      [Access.key!(:fields)],
      &(&1 ++ [%Field{name: name, length: bits, units: 2 ** bitfield.exponent}])
    )
    |> put_in([Access.key!(:exponent)], bitfield.exponent + bits)
  end

  def to_integer(%__MODULE__{} = bf, values)
      when is_map(values) and map_size(values) == length(bf.fields) do
    Enum.reduce(bf.fields, 0, fn field, acc ->
      acc + field.units * Map.get(values, field.name)
    end)
  end

  def to_integer(_bf, _values), do: {:error, :invalid}
end
```

To use this `Bitfield` module we need to build up a bitfield that knows about our fields, their order, and their bit lengths. For ordering we'll simply go with the order that we add the fields

```elixir
bf =
  Bitfield.new()
  |> Bitfield.add_field(:candy, 3)
  |> Bitfield.add_field(:status, 1)
  |> Bitfield.add_field(:location, 7)
  |> Bitfield.add_field(:priority, 2)
```

After adding all of those fields our `Bitfield` struct looks like this. Note how the units have already been determined for each field and we know the next base-2 exponent we'd use if we were to add another field.

```elixir
%Bitfield{
  fields: [
    %Bitfield.Field{name: :candy, length: 3, units: 1},
    %Bitfield.Field{name: :status, length: 1, units: 8},
    %Bitfield.Field{name: :location, length: 7, units: 16},
    %Bitfield.Field{name: :priority, length: 2, units: 2048}
  ],
  exponent: 13
}
```

We can then use `Bitfield.to_integer/2` to generate a bitfield integer by passing it the `Bitfield` struct and a map of names to values.

```elixir
Bitfield.to_integer(bf, %{candy: 0, status: 1, location: 71, priority: 3})
# => 7288
```

That works! Wow wow wow. Wow.

# Constructing a bitfield using the bitwise left shift operator

We have another option available to us when we're constructing our bitfield: **bitwise left shift**. That operator allows us to push a value an arbitrary number of bits to the left. Essentially a shorthand for multiplying by a power of 2. It can make for bitfield generation code than can be easier to follow since we can directly reference each value's position in the bitfield.

| Bitwise left shift |   Base-2 | Base-10 |
| :----------------- | -------: | ------: |
| 1<<0               |        1 |       1 |
| 1<<1               |       10 |       2 |
| 1<<2               |      100 |       4 |
| 1<<3               |     1000 |       8 |
| 1<<4               |    10000 |      16 |
| 1<<5               |   100000 |      32 |
| 1<<6               |  1000000 |      64 |
| 1<<7               | 10000000 |     128 |

That's great because instead of doing the work to figure out the unit powers of two for each field we can simply take our value and shift it the right length of bits to the left.

For an example let's build this bitfield up with left shift manually. Of course there are also many ways we could nicely wrap it up into a module.

Note: in Elixir the bitwise left shift operator is `<<<` from the `Bitwise` module.

```elixir
import Bitwise

bitfield = 0

# -- candy ---------

candy_value = 0
candy_bits = 3
candy_position = 0

bitfield = bitfield + (candy_value <<< candy_position)
# => 0

bitfield |> String.to_integer(2)
# => 0

# -- status --------

status_value = 1
status_bits = 1
status_position = candy_position + candy_bits

bitfield = bitfield + (status_value <<< status_position)
# => 8

bitfield |> String.to_integer(2)
# => 1000

# -- location -------

location_value = 71
location_bits = 7
location_position = status_position + status_bits

bitfield = bitfield + (location_value <<< location_position)
# => 1144

bitfield |> String.to_integer(2)
# => 10001111000

# -- priority -------

priority_value = 3
priority_bits = 2
priority_position = location_position + location_bits

bitfield = bitfield + (priority_value <<< priority_position)
# => 7288

bitfield |> String.to_integer(2)
# => 1110001111000
```

Let's call that done for creating a bitfield. Hooray!

## Bitfield creation: recap

1. Have some data
2. Put the data into a consistent order (e.g. our priority, location, status, candy)
3. Limit the data to a set of predefined values (e.g. our candy can only be one of a predefined list of candies)
4. Determine how many bits is required to hold each set of data

At that point you're ready to make a bitfield!

1. Convert each piece of data into its predefined value (e.g. peppermint patties converts to 0)
2. Incorporate each value into the bitfield using one of the transformation techniques (e.g. left shift each value to its correct position and adding up the results)
3. Represent the resulting bitfield number in whatever base works well. Base-10 is probably easiest.

Great! Now that we have a bitfield. How do we get the data back out?

# Parsing a bitfield

Now we have the opposite problem. We want to take a squished down opaque data representation and expand it back out into consumable data.

We can use **bitwise right shift** combined with **bitwise and** to pull apart the bitfield.

In Elixir we can also use binary pattern matching as long as we appropriately declare the size of our bitfield and its fields.

## bitwise RIGHT SHIFT

Bitwise right shift is the opposite of the bitwise left shift we used to assemble the bitfield. A bitwise right shift slides the binary number to the right: essentially dividing the number by powers of two.

```elixir
import Bitwise

55 >>> 0 #=> 55
55 >>> 1 #=> 27
55 >>> 2 #=> 13
55 >>> 3 #=> 6
55 >>> 4 #=> 3
55 >>> 5 #=> 1
55 >>> 6 #=> 0
55 >>> 7 #=> 0
55 >>> 8 #=> 0
55 >>> 9 #=> 0
```

What's happening here? It's easier to see if we represent each result in base-2.

```elixir
import Bitwise

for n <- 0..9 do
  result = 55 >>> n
  result_string = String.pad_leading("#{result}", 2, " ")

  result
  |> Integer.to_string(2)
  |> String.pad_leading(6, " ")
  |> IO.inspect(label: "55 >>> #{n} = #{result_string}")
end
```

```
55 >>> 0 = 55: "110111"
55 >>> 1 = 27: " 11011"
55 >>> 2 = 13: "  1101"
55 >>> 3 =  6: "   110"
55 >>> 4 =  3: "    11"
55 >>> 5 =  1: "     1"
55 >>> 6 =  0: "     0"
55 >>> 7 =  0: "     0"
55 >>> 8 =  0: "     0"
55 >>> 9 =  0: "     0"
```

Once our right shifting reaches zero there's no more bits to shift and any further right shifts will always be zero.

## Bitwise AND

The **bitwise AND** operator allows us to query a bitfield for any specific data field to extract any bits we're interested in. Combined with **bitwise RIGHT SHIFT** we can conver those extracted bits back into the original values.

Let's say we have a perfectly interesting binary number.

```elixir
0b00011011
```

Now let's say that number is a bitfield in this format:

| Field 1 | Field 2 | Field 3 |
| :-----: | :-----: | :-----: |
|  0001   |   10    |   11    |

Very cool. And now let's say we want to check on Field 2. We don't need to parse out Field 1 or Field 3. We just need the bits from field 2.

| 0 | 0 | 0 | 1 | 1 | 0 | 1 | 1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | ∧ | ∧ | | |

We can extract those bits out using **bitwise AND**.

Check it out!

```elixir
import Bitwise
0b00011011 &&& 0b1100
# => 8
```

Wow!

What just happened?

Essentially the bitwise AND operator compares two binary numbers digit by digit and produces a 1 if both numbers have a 1 for that digit or 0 otherwise. That means if we want to extract field data from a bitfield we want a number that has `1` values overlapping with our field and `0` values for all other digits.

| Bitfield | Comparison | Result |
| -------- | ---------- | ------ |
| 1        | 1          | 1      |
| 0        | 1          | 0      |
| 1        | 0          | 0      |
| 0        | 0          | 0      |

```plaintext
00011011 - the bitfield
00001100 - the comparison number
```

```elixir
0b00011011 #=> 27
0b00001100 #=> 12
```

```elixir
import Bitwise
27 &&& 12 #=> 8

27 &&& 12
|> Integer.to_string(2)
#=> "1000"
```

```plaintext
| Operation    | Base-2   | Base-10 |
|--------------|----------|---------|
| BITFIELD     | 00011011 | 27      |
| BITWISE AND  | 00001100 | 12      |
| RESULT       | 00001000 |  8      |
```

So we've said we want the value `10` which would be `2` in base-10. But we're getting the value `1000` which is `8` in base-10. What gives?

Zooming in on the field we care about. We know in our bitfield that it's `10`. We hit that `10` with an extraction hammer of `11` to knock out whatever the bits are at that position in our bitfield which is `10`. But Bitwise AND can't simply return "10" because the position of the digits is significiant.

We can think of the comparison number as a hammer of `1` bits that will knock out either the `1` or `0` in its corresponding position in the bitfield and then the result will have `0`s everywhere else.

What can we do to convert that `8` into the actual value `2`? We can **bitwise RIGHT SHIFT** the result the length of the fields that come before that value in the bitfield. In our example we have a field of two bits that comes before the value we're extracting. That means if we right shift the result by two we'll have the actual value we're trying to extract.

```elixir
# extract bits
extracted = 0b00011011 &&& 0b1100
#=> 8

# you don't need the leading zeros on the match
# but it can make the operation easier to read
0b00011011 &&&  # bitfield value and bitwise AND
0b00001100      # binary value to get out the bits
#=> 8

# right shift the result by two bits
extracted >>> 2
#=> 2
```

## Elixir pattern matching

With Elixir's binary pattern matching we can pull apart a bitfield with patterns.

In our example of `0b00011011` where we want to extract out the `10` in the second field:

```
0 0 0 1 1 0 1 1
        ^ ^ <----- these two digits
```

We can declare our pattern and pull that that field into a variable.

We'll say we have a field "a" that is 4 bits, a field "b" that is 2 bits, and a field "c" that's also 2 bits.

```elixir
<< a::4, b::2, c::2 >> = << 0b00011011::8 >>
b #=> 2

<< a::4, b::2, c::2 >> = << 27::8 >>
b #=> 2
```

The pattern matches and our "b" variable simply contains the matched result. Easy!

How about pattern matching our candy bitfield example?

```elixir
<<priority::2, location::7, status::1, candy::3>> = <<7288::13>>
{priority, location, status, candy} #=> {3, 71, 1, 0}
```

That worked! Elixir binary pattern matching for the win.

## Parsing our candy status bitfield with bitwise AND

If we don't have Elixir or we don't want to use pattern matching we can extract any individual value from our bitfield using bitwise AND paired with bitwise RIGHT SHIFT.

To get data this way we need the bitfield value, the bit pattern for that field, and the number of bits we need to shift the result to the right to get the stored value.

Here are the values to extract our four fields. We simply fill in `1` for each position of the field and then `0` everywhere else.

| value           |    field |
| :-------------- | -------: |
| `1100000000000` | priority |
| `0011111110000` | location |
| `0000000001000` |   status |
| `0000000000111` |    candy |

Let's look at status and see how its bitwise AND comparison value can extract the actual value of the field while ignoring anything else in the bitfield.

```elixir
bitfield = 0b1110001111000

candy = 0b0000000000111
candy_shift_right = 0

status = 0b0000000001000
status_shift_right = 3

location = 0b0011111110000
location_shift_right = 4

priority = 0b11
priority_shift_right = 11


bitfield #=> 7288
|> Bitwise.band(status) #=> 8
|> Bitwise.bsr(status_shift_right) #=> 1

bitfield #=> 7288
|> Bitwise.band(location) #=> 1136
|> Bitwise.bsr(location_shift_right) #=> 71
```

Success! We can precisely extract only the bits that we need to know about using bitwise AND!

# Putting it all together in a module

With this more complete knowledge of bitfields we can put together a module that allows creating a bitfield, storing data, and getting that data back out.

The extraction of the data (`to_fields/2`) gets a little complicated because we can't simply declare a binary pattern. Instead we have to pull values from the binary from greatest to smallest until we have extracted all fields.

```elixir
defmodule Bitfield.V2 do
  defstruct fields: [], exponent: 0

  defmodule Field do
    defstruct [:name, :length, :position, :units]
  end

  def new() do
    %__MODULE__{}
  end

  def add_field(%__MODULE__{} = bitfield, name, bits) do
    bitfield
    |> update_in(
      [Access.key!(:fields)],
      &(&1 ++
          [
            %Field{
              name: name,
              length: bits,
              units: 2 ** bitfield.exponent
            }
          ])
    )
    |> put_in([Access.key!(:exponent)], bitfield.exponent + bits)
  end

  def to_integer(%__MODULE__{} = bf, values)
      when is_map(values) and map_size(values) == length(bf.fields) do
    Enum.reduce(bf.fields, 0, fn field, acc ->
      acc + field.units * Map.get(values, field.name)
    end)
  end

  def to_integer(_bf, _values), do: {:error, :invalid}

  def to_fields(%__MODULE__{} = bf, value) do
    bf.fields
    |> Enum.reverse()
    |> Enum.reduce({[], value, bf.exponent}, fn field, {results, val, length} ->
      <<result::size(field.length), rest::size(length - field.length)>> = <<val::size(length)>>
      results = [%{field.name => result} | results]
      {results, rest, length - field.length}
    end)
    |> then(fn {results, _val, _length} ->
      results
    end)
  end
end
```

```elixir
bf =
  Bitfield.V2.new()
  |> Bitfield.V2.add_field(:candy, 3)
  |> Bitfield.V2.add_field(:status, 1)
  |> Bitfield.V2.add_field(:location, 7)
  |> Bitfield.V2.add_field(:priority, 2)

value = Bitfield.V2.to_integer(bf, %{candy: 0, status: 1, location: 71, priority: 3})
#=> 7288

fields = Bitfield.V2.to_fields(bf, value)
#=> [%{candy: 0}, %{status: 1}, %{location: 71}, %{priority: 3}]
```

Success!

# Yay bitfields!

Bitfields are a somewhat obscure data structure: but they're out there! Famously the Reddit r/place April Fool's event was created by using a Redis bitfield.

> We used a bitfield of 1 million 4 bit integers. Each 4 bit integer was able to encode a 4 bit color, and the x,y coordinates were determined by the offset (offset = x + 1000y) within the bitfield. We could read the entire board state by reading the entire bitfield. We were able to update individual tiles by updating the value of the bitfield at a specific offset (no need for locking or read/modify/write).
>
> — [How we built r/place](https://redditblog.com/2017/04/13/how-we-built-rplace/)

If you ever come across an integer that seems to be weirdly treated as data: there's a good chance that's a bitfield!

If you ever need to squish a predefined and rigorously scoped set of data into the smallest possible space: that could be a bitfield!

<script type="module" src="bitfields.js"></script>
