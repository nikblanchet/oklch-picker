type Color = readonly [name: string, code: string, hex: string]

export interface Winner {
  colors: readonly [Color] | readonly [Color, Color]
  year: number
}

/** The latest year goes first. */
export const WINNERS: readonly Winner[] = [
  { colors: [['Cloud Dancer', '11-4201', '#f0efeb']], year: 2026 },
  { colors: [['Mocha Mousse', '17-1230', '#a47764']], year: 2025 },
  { colors: [['Peach Fuzz', '13-1023', '#febe98']], year: 2024 },
  { colors: [['Viva Magenta', '18-1750', '#bb2648']], year: 2023 },
  { colors: [['Very Peri', '17-3938', '#6767ab']], year: 2022 },
  {
    colors: [
      ['Illuminating', '13-0647', '#f5df4e'],
      ['Ultimate Gray', '17-5104', '#939597']
    ],
    year: 2021
  },
  { colors: [['Classic Blue', '19-4052', '#0f4d81']], year: 2020 },
  { colors: [['Living Coral', '16-1546', '#ff6f62']], year: 2019 },
  { colors: [['Ultra Violet', '18-3838', '#5f4b8b']], year: 2018 },
  { colors: [['Greenery', '15-0343', '#89b04c']], year: 2017 },
  {
    colors: [
      ['Rose Quartz', '13-1520', '#f7cac9'],
      ['Serenity', '15-3919', '#92a9d1']
    ],
    year: 2016
  },
  { colors: [['Marsala', '18-1438', '#96504c']], year: 2015 },
  { colors: [['Radiant Orchid', '18-3224', '#ac5f99']], year: 2014 },
  { colors: [['Emerald', '17-5641', '#009572']], year: 2013 },
  { colors: [['Tangerine Tango', '17-1463', '#de4124']], year: 2012 },
  { colors: [['Honeysuckle', '18-2120', '#d95070']], year: 2011 },
  { colors: [['Turquoise', '15-5519', '#46b5ab']], year: 2010 },
  { colors: [['Mimosa', '14-0848', '#efc05a']], year: 2009 },
  { colors: [['Blue Iris', '18-3943', '#5b5b9f']], year: 2008 },
  { colors: [['Chili Pepper', '19-1557', '#9b1b2f']], year: 2007 },
  { colors: [['Sand Dollar', '13-1106', '#dfcdbe']], year: 2006 },
  { colors: [['Blue Turquoise', '15-5217', '#52b0ae']], year: 2005 },
  { colors: [['Tigerlily', '17-1456', '#e3583e']], year: 2004 },
  { colors: [['Aqua Sky', '14-4811', '#7cc4c5']], year: 2003 },
  { colors: [['True Red', '19-1664', '#bf1a32']], year: 2002 },
  { colors: [['Fuchsia Rose', '17-2031', '#c64376']], year: 2001 },
  { colors: [['Cerulean', '15-4020', '#9cb7d4']], year: 2000 }
]
